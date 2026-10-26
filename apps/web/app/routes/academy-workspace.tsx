import { AcademyAssignments } from "../components/academy-assignments";
import { AcademyProgress } from "../components/academy-progress";
import { AcademyLearning } from "../components/academy-learning";
import { AcademyTimetable } from "../components/academy-timetable";
import { Link, useLocation, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { cohortSchema, enrolmentSchema } from "@psycocity/validation";
import { apiGet } from "../lib/api";
import { Notice } from "../components/ui";
export function meta(){return [{title:"Private academy cohort — Psycocity"},{name:"robots",content:"noindex"}];}
export default function AcademyWorkspace(){const {cohortId}=useParams();const staff=useLocation().pathname.startsWith("/admin");const query=useQuery({queryKey:[staff?"admin":"member","cohort-home",cohortId],queryFn:async({signal})=>staff?apiGet(`/admin/cohorts/${cohortId}`,cohortSchema,signal):(await apiGet(`/academy/cohorts/${cohortId}/record`,enrolmentSchema,signal)).cohort});return <main id="main" className="page wrap"><Link className="text-link" to={staff?"/admin/cohorts":"/member/student"}>Back to {staff?"cohort management":"student portal"}</Link>{query.isPending?<Notice>Loading authorized cohort…</Notice>:query.isError?<Notice error>{query.error.message}</Notice>:<><p className="eyebrow">PRIVATE ACADEMY COHORT</p><h1>{query.data.name}</h1><p className="lede">{query.data.description}</p><p>{query.data.startsOn}–{query.data.endsOn} · {query.data.status}</p><p>Dates use Africa/Lagos. Archive access: {query.data.archiveAccess?"available for active/completed enrolments":"not enabled after course end"}.</p><p>Completion criteria: {query.data.completionCriteria||"The agency has not yet configured completion criteria."}</p><AcademyTimetable cohortId={query.data.id} staff={staff}/><AcademyLearning cohortId={query.data.id} staff={staff}/><AcademyProgress cohortId={query.data.id} staff={staff}/><AcademyAssignments cohortId={query.data.id} staff={staff}/></>}</main>;}
