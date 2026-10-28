import {expect,test} from "@playwright/test";
import {submittedApplicant} from "./fixtures";
import {staffContext} from "./staff-fixture";
import {createDatabase} from "../../apps/api/src/database.js";
import {createEventModels} from "../../apps/api/src/events/models.js";

test("reschedules, confirms, assesses and accepts an applicant with the correct fee",async({page,request,browser})=>{
  const applicant=await submittedApplicant(request);
  await page.context().addCookies([
    {name:"psycocity_session",value:applicant.session.token,url:"http://127.0.0.1:3101",httpOnly:true,sameSite:"Lax"},
    {name:"psycocity_csrf",value:applicant.session.csrfToken,url:"http://127.0.0.1:3101",sameSite:"Lax"},
  ]);
  const staff=await staffContext(browser);
  try{
    const admin=await staff.context.newPage();
    await admin.goto(`http://127.0.0.1:3101/admin/applications/${applicant.id}`);
    await admin.getByRole("button",{name:"Start review",exact:true}).click();
    await expect(admin.getByRole("button",{name:"Start review",exact:true})).toBeDisabled();
    // Create a future event through the operational API; assignment and all
    // applicant/staff decisions below use their actual portal controls.
    const csrf=(await staff.context.cookies()).find(cookie=>cookie.name==="psycocity_csrf")!.value;
    const future=Date.now()+15*86400_000;
    const headers={Origin:"http://127.0.0.1:3101","X-Requested-With":"Psycocity","X-CSRF-Token":csrf};
    const title=`Decision journey ${applicant.id}`;
    expect((await admin.request.post("/api/v1/admin/events",{headers,data:{title,description:"A private admission assessment for this applicant.",instructions:"Please arrive ten minutes before your appointment.",track:"academy",mode:"in_person",venue:"Lagos test studio",meetingUrl:"",startsAt:new Date(future).toISOString(),endsAt:new Date(future+7200_000).toISOString(),capacity:1}})).status()).toBe(200);
    await admin.reload();
    const select=admin.getByLabel("Admission event",{exact:true});
    const eventId=(await select.locator("option").filter({hasText:title}).getAttribute("value"))!;
    await select.selectOption(eventId);
    const wat=(milliseconds:number)=>new Date(milliseconds+3600_000).toISOString().slice(0,23);
    await expect(admin.getByLabel("Assigned slot starts (WAT)",{exact:true})).toHaveValue(wat(future));
    await expect(admin.getByLabel("Assigned slot ends (WAT)",{exact:true})).toHaveValue(wat(future+7200_000));
    await admin.getByRole("button",{name:"Assign slot and email applicant",exact:true}).click();
    await expect(admin.getByText("Admission schedule updated",{exact:true})).toBeVisible();
    await page.goto("/applicant/dashboard");
    await page.getByRole("button",{name:"Request a different time",exact:true}).click();
    await page.getByLabel("Reason for a different appointment",{exact:true}).fill("I have an examination that morning. Please consider a later slot.");
    await page.getByLabel("Suggested start (WAT)",{exact:true}).fill(wat(future+1800_000).slice(0,16));
    await page.getByLabel("Suggested finish (WAT)",{exact:true}).fill(wat(future+3600_000).slice(0,16));
    await page.getByRole("button",{name:"Send reschedule request",exact:true}).click();
    await expect(page.getByText(/Reschedule requested\. The original slot/)).toBeVisible();
    await admin.goto("http://127.0.0.1:3101/admin/events");
    await admin.getByLabel("Show appointments",{exact:true}).selectOption("reschedule");
    const entry=admin.locator("article").filter({hasText:applicant.name});
    await expect(entry.getByText(/Change requested: I have an examination/)).toBeVisible();
    await entry.getByRole("link",{name:"Open application / assign a different slot",exact:true}).click();
    await admin.getByLabel("Admission event",{exact:true}).selectOption(eventId);
    await admin.getByLabel("Assigned slot starts (WAT)",{exact:true}).fill(wat(future+1800_000).slice(0,16));
    await admin.getByLabel("Assigned slot ends (WAT)",{exact:true}).fill(wat(future+3600_000).slice(0,16));
    await admin.getByRole("button",{name:"Assign slot and email applicant",exact:true}).click();
    await expect(admin.getByText("Admission schedule updated",{exact:true})).toBeVisible();
    await page.reload();
    await page.getByRole("button",{name:"Confirm attendance",exact:true}).click();
    await expect(page.getByText("RSVP saved",{exact:true})).toBeVisible();
    // Advance only this fixture's schedule in the dedicated test database;
    // no production clock override or bypass endpoint exists.
    const uri=process.env.TEST_MONGODB_URI!;
    if(!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri))throw new Error("Dedicated test database required");
    const database=createDatabase(uri);
    try{await database.connect();const models=createEventModels(database.connection);await models.Invitation.updateOne({eventId,applicationId:applicant.id},{$set:{startsAt:new Date(Date.now()-7200_000),endsAt:new Date(Date.now()-3600_000)}});}finally{await database.close();}
    await admin.goto("http://127.0.0.1:3101/admin/events");
    await admin.getByLabel("Show appointments",{exact:true}).selectOption("decisions");
    const finished=admin.locator("article").filter({hasText:applicant.name});
    await finished.getByLabel("Assessment note visible to applicant",{exact:true}).fill("Attended the assessment and demonstrated readiness for academy training.");
    await finished.getByRole("button",{name:"Complete assessment",exact:true}).click();
    await finished.getByRole("link",{name:"Accept / reject and leave decision note",exact:true}).click();
    await admin.getByLabel("Decision reason (visible to applicant)",{exact:true}).fill("Congratulations. We are pleased to offer you a place in the academy.");
    await admin.getByRole("button",{name:"Record admission decision",exact:true}).click();
    await expect(admin.getByRole("heading",{name:/50,000.*Academy tuition/})).toBeVisible();
    await page.goto(`/applicant/application/${applicant.id}`);
    await expect(page.getByRole("heading",{name:/50,000.*Academy tuition/})).toBeVisible();
    await expect(page.getByText(/Congratulations\. We are pleased/)).toBeVisible();
  }finally{await staff.context.close();}
});
