interface SwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/** Aan/uit-schakelaar met titel en uitleg, bedienbaar met het toetsenbord. */
export function Switch({ label, description, checked, disabled, onChange }: SwitchProps) {
  return (
    <label className={`switch-row${disabled ? ' disabled' : ''}`}>
      <span className="switch-text">
        <b>{label}</b>
        {description && <small>{description}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
      <i className="switch-track" aria-hidden="true" />
    </label>
  );
}
