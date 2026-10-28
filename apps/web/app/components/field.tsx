import { useId, useState, type InputHTMLAttributes } from "react";

export function Field({ label, error, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const generated = useId();
  const [visible, setVisible] = useState(false);
  const id = props.id ?? generated;
  const descriptionId = `${id}-description`;
  const password = props.type === "password";
  const input = <input {...props} id={id} type={password && visible ? "text" : props.type} aria-invalid={error ? true : undefined} aria-describedby={hint || error ? descriptionId : undefined} />;
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    {password ? <div className="password-control">
      {input}
      <button className="password-toggle" type="button" disabled={props.disabled} aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visible} aria-controls={id} onMouseDown={event => event.preventDefault()} onClick={() => setVisible(value => !value)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="m3 3 18 18" />}
        </svg>
      </button>
    </div> : input}
    <p id={descriptionId} className={error ? "field-error" : "field-hint"}>{error ?? hint}</p>
  </div>;
}
