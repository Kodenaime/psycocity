import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { publicModelSchema } from "@psycocity/validation";
import { apiGet } from "../lib/api";
import { Notice } from "../components/ui";
export function meta() {return [{title: "Private approved-profile preview — Psycocity"}, {name: "robots", content: "noindex"}];}
export default function PublishedPreview() {const query = useQuery({queryKey: ["member", "approved-preview"], queryFn: ({signal}) => apiGet("/member/model/published", publicModelSchema, signal)}); return <main id="main" className="page wrap"><Link className="text-link" to="/member/model">Back to model profile</Link><p className="eyebrow">AUTHORIZED APPROVED REVISION PREVIEW</p>{query.isPending ? <Notice>Loading approved revision…</Notice> : query.isError ? <Notice error>{query.error.message}</Notice> : <><h1>{query.data.professionalName}</h1><p className="lede">{query.data.bio}</p><p>{query.data.city}, {query.data.state} · {query.data.heightCm} cm · {query.data.shoeSizeEU} EU</p><div className="photo-grid">{query.data.photos.map(photo => <figure key={photo.id}><img src={photo.url} alt={photo.alt} width={photo.width} height={photo.height} /><figcaption>{photo.credit}</figcaption></figure>)}</div></>}</main>;}
