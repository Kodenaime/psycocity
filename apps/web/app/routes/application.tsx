import { ApplicationExport } from "../components/application-export";
import { HeightMeasurement } from "../components/height-measurement";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBeforeUnload, useBlocker, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ageOn, applicationSchema, birthDateSchema, lagosDate, saveApplicationSchema, nigeriaStates, type Application, type DraftAnswers } from "@psycocity/validation";
import { draftSignature } from "../lib/drafts";
import { apiGet, apiPatch, ApiError } from "../lib/api";
import { SubmissionReview } from "../components/submission-review";
import { ApplicationStatus } from "../components/application-status";
import { ApplicationPhotoStep } from "../components/guardian-consent";
import { Field } from "../components/field";
import { Button, Notice } from "../components/ui";
export function meta() { return [{ title: "Your application draft — Psycocity" }, { name: "robots", content: "noindex" }]; }

type FormField = { name: string; label: string; kind?: "date" | "tel" | "number" | "url" | "long" | "choice"; choices?: string[]; hint?: string };
const placeholders:Record<string,string>={legalName:"Your full name as shown on your ID",professionalName:"The name you use professionally (optional)",phone:"e.g. 08012345678",city:"e.g. Ikeja",heightCm:"e.g. 175",bustChestCm:"e.g. 86",waistCm:"e.g. 70",hipsCm:"e.g. 94",shoeSize:"e.g. 7",introduction:"Introduce yourself, your interests and why you want to join Psycocity.",experience:"Describe shoots, shows or training. Write ‘No experience yet’ if you are starting out.",interests:"e.g. editorial, runway, commercial, beauty or fitness",availability:"Tell us your available days, times and travel limitations.",portfolioUrl:"https://your-portfolio.example (optional)",socialUrl:"https://instagram.com/your-profile (optional)",learningGoals:"What skills and confidence would you like to develop?",hybridAvailability:"Tell us when you can attend studio and online classes.",representationHistory:"Name previous agencies, or write ‘Independent / none’.",contractualRestrictions:"Describe any current agency contracts or exclusivity, or write ‘None’."};
const sectionFields: { key: keyof DraftAnswers; title: string; fields: FormField[] }[] = [
  { key: "personal", title: "Your introduction", fields: [{ name: "legalName", label: "Legal name" }, { name: "professionalName", label: "Professional or preferred name", hint: "Optional. Use the name you work under." }, { name: "birthDate", label: "Date of birth", kind: "date", hint: "Your date of birth stays private." }, { name: "phone", label: "Phone number", kind: "tel" }] },
  { key: "location", title: "Where you’re based", fields: [{ name: "country", label: "Country", kind: "choice", choices: ["Nigeria"] }, { name: "state", label: "State or FCT", kind: "choice", choices: [...nigeriaStates] }, { name: "city", label: "City" }] },
  { key: "measurements", title: "Your professional statistics", fields: [{ name: "heightCm", label: "Height (cm)", kind: "number" }, { name: "bustChestCm", label: "Bust / chest (cm)", kind: "number" }, { name: "waistCm", label: "Waist (cm)", kind: "number" }, { name: "hipsCm", label: "Hips (cm)", kind: "number" }, { name: "shoeSize", label: "Shoe size", kind: "number" }, { name: "shoeSystem", label: "Shoe sizing system", kind: "choice", choices: ["EU", "UK", "US"] }] },
  { key: "background", title: "Your experience and perspective", fields: [{ name: "introduction", label: "Tell us about yourself", kind: "long" }, { name: "experience", label: "Modelling experience", kind: "long", hint: "Academy applicants do not need prior experience." }, { name: "interests", label: "Modelling interests", kind: "long" }, { name: "availability", label: "Availability", kind: "long" }, { name: "portfolioUrl", label: "Portfolio URL (optional)", kind: "url" }, { name: "socialUrl", label: "Social profile URL (optional)", kind: "url" }] },
];
export default function ApplicationRoute() {
  const { id } = useParams(); const navigate = useNavigate();
  const query = useQuery({ queryKey: ["applications", id], queryFn: ({ signal }) => apiGet(`/applications/${id}`, applicationSchema, signal) });
  useEffect(() => { if (query.isError && query.error instanceof ApiError && query.error.status === 401) void navigate("/applicant/login", { replace: true }); }, [query.isError, query.error, navigate]);
  if (query.isPending) return <main id="main" className="page wrap"><Notice>Loading your application…</Notice></main>;
  if (query.isError) return <main id="main" className="page wrap"><Notice error>{query.error.message}</Notice><Link to="/applicant/dashboard">Return to your account</Link></main>;
  if (!["draft", "corrections_requested"].includes(query.data.status)) return <ApplicationStatus application={query.data} />;
  return <Editor key={query.data.id} initial={query.data} />;
}
function Editor({ initial }: { initial: Application }) {
  const client = useQueryClient();
  const [answers, setAnswers] = useState<DraftAnswers>(()=>initial.status==="draft"&&!initial.answers.measurements?.shoeSystem?{...initial.answers,measurements:{...initial.answers.measurements,shoeSystem:"UK"}}:initial.answers);
  const [track, setTrack] = useState(initial.track);
  const [version, setVersion] = useState(initial.version);
  const [saved, setSaved] = useState(draftSignature(initial.track, initial.answers));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const dirty = saved !== draftSignature(track, answers);
  const correction = initial.status === "corrections_requested";
  const permitted = new Set<string>(initial.correctionFields);
  useEffect(() => {
    if (!dirty && initial.version > version) { setVersion(initial.version); setAnswers(initial.answers); setTrack(initial.track); setSaved(draftSignature(initial.track, initial.answers)); }
  }, [dirty, initial, version]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm("Leave without saving your latest changes?")) blocker.proceed(); else blocker.reset();
    }
  }, [blocker]);
  useBeforeUnload(useCallback(event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } }, [dirty]));
  useEffect(() => { heading.current?.focus(); }, [step]);
  const trackSection = track === "academy" ? { key: "academy" as const, title: "Your learning goals", fields: [{ name: "learningGoals", label: "What would you like to learn?", kind: "long" as const }, { name: "hybridAvailability", label: "Availability for in-person and online sessions", kind: "long" as const }] } : { key: "established" as const, title: "Your professional background", fields: [{ name: "representationHistory", label: "Previous representation", kind: "long" as const }, { name: "contractualRestrictions", label: "Current contractual restrictions", kind: "long" as const }] };
  const sections = [...sectionFields, trackSection];
  const section = sections[step];
  const save = useMutation({ mutationFn: (input: { data: { version: number; track: typeof track; answers: DraftAnswers }; advance: boolean }) => apiPatch(`/applications/${initial.id}`, input.data, applicationSchema), onSuccess: async (data, input) => {
    setVersion(data.version); setSaved(draftSignature(input.data.track, input.data.answers));
    client.setQueryData(["applications", initial.id], data);
    await client.invalidateQueries({ queryKey: ["applications", "list"] });
    await client.invalidateQueries({ queryKey: ["guardian", initial.id] });
    await client.invalidateQueries({ queryKey: ["application-requirements", initial.id] });
    if (input.advance) setStep(value => Math.min(value + 1, sections.length + 1));
  } });
  function submit(advance: boolean) {
    const data = { version, answers, track };
    const parsed = saveApplicationSchema.safeParse(data);
    if (!parsed.success) {
      const issues: Record<string, string> = {};
      for (const issue of parsed.error.issues) issues[issue.path.join(".")] = issue.message;
      setErrors(issues);
      const firstGroup = parsed.error.issues[0]?.path[1];
      const firstStep = sections.findIndex(value => value.key === firstGroup);
      if (firstStep >= 0) setStep(firstStep);
      return;
    }
    setErrors({}); save.mutate({ data: parsed.data as typeof data, advance });
  }
  function valueFor(group: keyof DraftAnswers, name: string) {
    const value = (answers[group] as Record<string, unknown> | undefined)?.[name];
    return typeof value === "string" || typeof value === "number" ? value : "";
  }
  function change(group: keyof DraftAnswers, name: string, value: string, numeric = false) {
    setAnswers(current => ({ ...current, [group]: { ...current[group], [name]: numeric ? value === "" ? undefined : Number(value) : (name === "country" || name === "shoeSystem") && value === "" ? undefined : value } }));
  }
  const date = answers.personal?.birthDate;
  const age = date && birthDateSchema.safeParse(date).success ? ageOn(date) : undefined;
  const minimum = track === "academy" ? 16 : 18;
  return <main id="main" className="page wrap application-page"><p className="eyebrow">YOUR PRIVATE APPLICATION</p><h1>{correction ? "A few updates." : "A little about you."}</h1>{correction && <Notice>{initial.correctionMessage} Only the requested fields can be changed.</Notice>}<p className="lede">Save your progress and come back anytime. Measurements inform assessment; they are not automatic admission thresholds.</p>
    <div className="application-toolbar"><label>Application track <select aria-label="Application track" disabled={correction} value={track} onChange={event => setTrack(event.target.value as typeof track)}><option value="academy">Academy · 16+</option><option value="established">Agency representation · 18+</option></select></label><span aria-live="polite">{save.isPending ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}</span></div>
    {age !== undefined && age < minimum && <Notice error>This track requires applicants to be at least {minimum}. You can save a draft, but you are not eligible to submit.</Notice>}
    {track === "academy" && age !== undefined && age >= 16 && age < 18 && <Notice>Guardian verification and consent will be required before submission.</Notice>}
    <nav className="wizard-steps" aria-label="Application steps">{[...sections.map(value => value.title), "Photographs", "Review draft"].map((title, index) => <button key={title} type="button" aria-current={index === step ? "step" : undefined} onClick={() => setStep(index)}>{index + 1}. {title}</button>)}</nav>
    <h2 ref={heading} tabIndex={-1}>{section?.title ?? (step === sections.length ? "Your application photographs" : "Your draft at a glance")}</h2>
    {section ? <form className="application-form" onSubmit={event => { event.preventDefault(); submit(true); }} noValidate>
      {section.fields.map(field => {
        const key = `${section.key}.${field.name}`; const error = errors[`answers.${key}`];
        const disabled = correction && !permitted.has(key);
        if(field.name==="heightCm")return <HeightMeasurement key={key} value={answers.measurements?.heightCm} disabled={disabled} error={error} onChange={value=>setAnswers(current=>({...current,measurements:{...current.measurements,heightCm:value}}))}/>;
        if (field.kind === "long") return <div className="field" key={key}><label htmlFor={key}>{field.label}</label><textarea id={key} placeholder={placeholders[field.name]} disabled={disabled} rows={5} maxLength={2000} value={valueFor(section.key, field.name)} onChange={event => change(section.key, field.name, event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${key}-error` : undefined} />{error && <p id={`${key}-error`} className="field-error">{error}</p>}</div>;
        if (field.kind === "choice") return <div className="field" key={key}><label htmlFor={key}>{field.label}</label><select id={key} disabled={disabled} value={valueFor(section.key, field.name)} onChange={event => change(section.key, field.name, event.target.value)}><option value="">Select an option</option>{field.choices!.map(option => <option key={option}>{option}</option>)}</select></div>;
        return <Field key={key} disabled={disabled} id={key} label={field.name==="shoeSize"?`Shoe size (${answers.measurements?.shoeSystem??"UK"})`:field.label} placeholder={placeholders[field.name]} type={field.kind ?? "text"} value={valueFor(section.key, field.name)} onChange={event => change(section.key, field.name, event.target.value, field.kind === "number")} max={field.kind === "date" ? lagosDate() : field.kind === "number" ? 300 : undefined} min={field.kind === "number" ? 0.1 : undefined} step={field.kind === "number" ? "0.1" : undefined} hint={field.hint??(section.key==="measurements"?field.name==="shoeSize"?"Use the selected shoe system; UK is the default.":"Enter your measurement in centimetres (cm).":field.kind==="date"?"Choose your actual date of birth.":undefined)} error={error} />;
      })}
      <div className="actions"><Button type="button" disabled={save.isPending} onClick={() => submit(false)}>Save draft</Button><Button className="button-secondary" type="submit" disabled={save.isPending}>Save and continue</Button></div>
    </form> : step === sections.length ? <div>{dirty && <Button disabled={save.isPending} onClick={() => submit(false)}>Save latest changes</Button>}<ApplicationPhotoStep applicationId={initial.id} dirty={dirty} guardianEditable={!correction || ["guardian", "personal.legalName", "personal.birthDate"].some(path => permitted.has(path))} allowedSlots={correction ? initial.correctionFields.filter(path => path.startsWith("photos.")).map(path => path.slice(7)) : undefined} /><Button className="button-secondary" onClick={() => setStep(sections.length + 1)}>Review draft</Button></div> : <section className="prose-section"><dl className="draft-review">{sections.map(group => <div key={group.key}><dt>{group.title}</dt><dd>{group.fields.map(field => <p key={field.name}><strong>{field.label}:</strong> {valueFor(group.key, field.name) || "Not provided"}</p>)}</dd></div>)}</dl><Button disabled={save.isPending} onClick={() => submit(false)}>Save draft</Button><SubmissionReview applicationId={initial.id} version={version} dirty={dirty} onIssue={path => { const index = sections.findIndex(value => value.key === path.split(".")[1]); setStep(index >= 0 ? index : sections.length); }} /></section>}
    {Object.keys(errors).length > 0 && <Notice error>Some fields need attention. Check the marked fields or revisit earlier steps.</Notice>}
    {save.isError && <Notice error>{save.error.message} Your local edits are still shown.</Notice>}
    <ApplicationExport id={initial.id}/><div className="account-links"><Link to="/applicant/dashboard">Back to your account</Link></div>
  </main>;
}
