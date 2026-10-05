import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useState,
} from 'react';
import { cx } from './cx';
import styles from './field.module.css';
import { Icon } from './icon';

type ShellProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  required?: boolean;
  aside?: ReactNode;
  counter?: { value: number; max: number };
  children: ReactNode;
};

export function describedBy(id: string, hint?: ReactNode, error?: string) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
}

export function FieldShell({ id, label, hint, error, required, aside, counter, children }: ShellProps) {
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden="true">
              *
            </span>
          )}
        </label>
        {aside && <span className={styles.aside}>{aside}</span>}
      </div>
      {children}
      {(hint || counter) && (
        <div className={styles.hint}>
          {hint && <span id={`${id}-hint`}>{hint}</span>}
          {counter && (
            <span className={cx(styles.counter, counter.value > counter.max && styles.counterOver)}>
              {counter.value} / {counter.max}
            </span>
          )}
        </div>
      )}
      {error && (
        <p className={styles.error} id={`${id}-error`}>
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}
    </div>
  );
}

type Common = { id: string; label: ReactNode; hint?: ReactNode; error?: string | undefined; aside?: ReactNode };

export function TextField({
  id,
  label,
  hint,
  error,
  aside,
  required,
  prefix,
  className,
  ...input
}: Common & InputHTMLAttributes<HTMLInputElement> & { prefix?: string }) {
  const control = (
    <input
      {...input}
      id={id}
      required={required}
      className={cx(styles.control, className)}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, hint, error)}
    />
  );
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required ?? false} aside={aside}>
      {prefix ? (
        <div className={styles.affix}>
          <span className={styles.affixLabel} aria-hidden="true">
            {prefix}
          </span>
          {control}
        </div>
      ) : (
        control
      )}
    </FieldShell>
  );
}

export function TextareaField({
  id,
  label,
  hint,
  error,
  aside,
  required,
  maxLength,
  value,
  ...textarea
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required ?? false}
      aside={aside}
      {...(maxLength ? { counter: { value: value.length, max: maxLength } } : {})}
    >
      <textarea
        {...textarea}
        id={id}
        value={value}
        required={required}
        maxLength={maxLength}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      />
    </FieldShell>
  );
}

export type Option<T extends string> = { value: T; label: string; disabled?: boolean };

export function SelectField<T extends string>({
  id,
  label,
  hint,
  error,
  aside,
  required,
  options,
  value,
  onValueChange,
  placeholder,
  ...select
}: Common &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & {
    options: Option<T>[];
    value: T | '';
    onValueChange: (value: T) => void;
    placeholder?: string;
  }) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required ?? false} aside={aside}>
      <select
        {...select}
        id={id}
        value={value}
        required={required}
        onChange={(event) => onValueChange(event.target.value as T)}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode;
  description?: ReactNode;
};

export function Checkbox({ label, description, className, ...input }: CheckboxProps) {
  return (
    <label className={cx(styles.check, className)}>
      <input type="checkbox" {...input} />
      <span className={styles.checkText}>
        <span className={styles.checkTitle}>{label}</span>
        {description && <span className={styles.checkDescription}>{description}</span>}
      </span>
    </label>
  );
}

type SwitchProps = {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
};

export function Switch({ id, checked, onCheckedChange, label, description, disabled }: SwitchProps) {
  return (
    <div className={styles.check}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-description` : undefined}
        className={styles.switch}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
      />
      <span className={styles.checkText}>
        <span className={styles.checkTitle} id={`${id}-label`}>
          {label}
        </span>
        {description && (
          <span className={styles.checkDescription} id={`${id}-description`}>
            {description}
          </span>
        )}
      </span>
    </div>
  );
}

type ToggleGroupProps<T extends string> = {
  label: string;
  options: Option<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
  max?: number;
  error?: string | undefined;
  hint?: ReactNode;
  id: string;
};

/** Multi-select rendered as toggle buttons; the group label is announced for every button. */
export function ToggleGroup<T extends string>({
  label,
  options,
  selected,
  onChange,
  max,
  error,
  hint,
  id,
}: ToggleGroupProps<T>) {
  const limitReached = max !== undefined && selected.length >= max;
  return (
    <fieldset className={styles.field} aria-describedby={describedBy(id, hint, error)}>
      <legend className={styles.label}>{label}</legend>
      <div className={styles.chips}>
        {options.map((option) => {
          const pressed = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className={styles.chipToggle}
              aria-pressed={pressed}
              disabled={!pressed && limitReached}
              onClick={() =>
                onChange(pressed ? selected.filter((value) => value !== option.value) : [...selected, option.value])
              }
            >
              {pressed && <Icon name="check" size={16} />}
              {option.label}
            </button>
          );
        })}
      </div>
      {hint && (
        <span className={styles.hint} id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <p className={styles.error} id={`${id}-error`}>
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}
    </fieldset>
  );
}

type TokenInputProps = {
  id: string;
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  max: number;
  maxLength: number;
  hint?: ReactNode;
  aside?: ReactNode;
  error?: string | undefined;
};

export function TokenInput({ id, label, values, onChange, max, maxLength, hint, aside, error }: TokenInputProps) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (!value || values.includes(value) || values.length >= max) return;
    onChange([...values, value]);
    setDraft('');
  };
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} aside={aside}>
      {values.length > 0 && (
        <ul className={styles.tokenList} aria-label={label}>
          {values.map((value) => (
            <li key={value} className={styles.token}>
              {value}
              <button
                type="button"
                className={styles.tokenRemove}
                aria-label={`Удалить «${value}»`}
                onClick={() => onChange(values.filter((item) => item !== value))}
              >
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.tokenInput}>
        <input
          id={id}
          className={styles.control}
          value={draft}
          maxLength={maxLength}
          disabled={values.length >= max}
          aria-describedby={describedBy(id, hint, error)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className={styles.chipToggle} onClick={add} disabled={!draft.trim()}>
          <Icon name="plus" size={16} />
          Добавить
        </button>
      </div>
    </FieldShell>
  );
}
