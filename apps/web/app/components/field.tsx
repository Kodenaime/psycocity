import { useId, type InputHTMLAttributes } from "react";
export function Field({ label, error, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const generated = useId();
  const id = props.id ?? generated;
  const descriptionId = `${id}-description`;
  return <div className="field"><label htmlFor={id}>{label}</label><input {...props} id={id} aria-invalid={error ? true : undefined} aria-describedby={hint || error ? descriptionId : undefined} /><p id={descriptionId} className={error ? "field-error" : "field-hint"}>{error ?? hint}</p></div>;
}
