import {expect,test} from "@playwright/test";
import {draftApplicant} from "./fixtures";
import {staffContext} from "./staff-fixture";
const widths=[360,480,720,1024,1444];
async function noOverflow(page:import("@playwright/test").Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
test("keeps public, account and operational page layouts within all five requested widths",async({page,request,browser})=>{
  test.setTimeout(120_000);
  for(const width of widths){
    await page.setViewportSize({width,height:950});
    for(const path of ["/models","/academy","/join","/faq","/contact","/booking","/privacy","/terms","/refund-policy","/applicant/register","/applicant/login","/member/login","/admin/login"]){
      await page.goto(path);await expect(page.getByRole("heading",{level:1})).toBeVisible();await noOverflow(page);
    }
  }
  const applicant=await draftApplicant(request);
  await page.context().addCookies([{name:"psycocity_session",value:applicant.session.token,url:"http://127.0.0.1:3101",httpOnly:true,sameSite:"Lax"}]);
  for(const width of widths){await page.setViewportSize({width,height:950});await page.goto("/applicant/dashboard");await expect(page.getByRole("heading",{level:1})).toBeVisible();await noOverflow(page);}
  const staff=await staffContext(browser);
  try{
    const admin=await staff.context.newPage();
    for(const width of widths){
      await admin.setViewportSize({width,height:950});
      for(const path of ["/admin/events","/admin/staff","/admin/audit","/admin/payments","/admin/portfolios","/admin/enquiries","/admin/castings","/admin/cohorts","/admin/operations"]){
        await admin.goto(`http://127.0.0.1:3101${path}`);await expect(admin.getByRole("heading",{level:1})).toBeVisible();await noOverflow(admin);
      }
    }
  }finally{await staff.context.close();}
});
