/*
 * Modal: satu <dialog class="bs-modal"> untuk seluruh workspace. Isi modal adalah elemen React yang
 * disimpan di useOverlay; FormModal menangani submit, galat per kolom, dan tombol sibuk.
 */
import { createContext, Fragment, useContext, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { closeModal, openModal, useOverlay } from '../../store';
import { Btn, cx, Options, type Opt } from './components';
import { Ic } from './Icon';

let trigger: HTMLElement | null = null;

export function ModalHost() {
  const modal = useOverlay(s => s.modal);
  const modalKey = useOverlay(s => s.modalKey);
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const d = ref.current; if (!d) return;
    if (modal && !d.open) { trigger = document.activeElement as HTMLElement | null; d.showModal(); }
    if (!modal && d.open) d.close();
  }, [modal]);
  return (
    <dialog ref={ref} className="bs-modal" id="bsModal" aria-labelledby="bsModalTitle"
      onClose={() => {
        if (useOverlay.getState().modal) closeModal();
        const t = trigger; trigger = null;
        requestAnimationFrame(() => {
          if (t && t.isConnected) t.focus({ preventScroll: true });
          else (document.querySelector('#bsDrawer[open] .bs-sheet-head button') as HTMLElement | null || document.getElementById('bsTitle'))?.focus({ preventScroll: true });
        });
      }}
      onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
      <Fragment key={modalKey}>{modal}</Fragment>
    </dialog>
  );
}

/* ---------- Form dalam modal ---------- */
export type FormErrors = Record<string, string>;
export type SubmitResult = void | string | FormErrors | Promise<void | string | FormErrors>;
const ErrCtx = createContext<FormErrors>({});

export interface FormModalProps {
  title: string; desc?: ReactNode; wide?: boolean | 'xl'; submit?: string; danger?: boolean; busyLabel?: string;
  onSubmit?: (fd: FormData, form: HTMLFormElement) => SubmitResult;
  footer?: ReactNode; children: ReactNode; initialFocus?: 'first' | 'cancel'; error?: string;
}
export function FormModal({ title, desc, wide = false, submit = 'Simpan', danger = false, busyLabel = 'Menyimpan…', onSubmit, footer, children, initialFocus = 'first', error = '' }: FormModalProps) {
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const dlg = formRef.current?.closest('dialog');
    dlg?.classList.toggle('is-wide', !!wide);
    dlg?.classList.toggle('is-xl', wide === 'xl');
    const f = formRef.current; if (!f) return;
    if (initialFocus === 'cancel') (f.querySelector('.bs-modal-foot [data-cancel]') as HTMLElement | null)?.focus();
    else (f.querySelector('.bs-modal-body :is(input:not([type=hidden]):not([type=file]):not([disabled]), select:not([disabled]), textarea)') as HTMLElement | null)?.focus();
  }, [wide, initialFocus]);
  const show = (r: string | FormErrors) => {
    if (typeof r === 'string') { setErrors({}); setFormError(r); return; }
    setErrors(r); setFormError('Periksa kembali isian yang ditandai.');
    requestAnimationFrame(() => (formRef.current?.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus());
  };
  const handle = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!onSubmit) { closeModal(); return; }
    const form = e.currentTarget;
    try {
      const res = onSubmit(new FormData(form), form);
      let r: void | string | FormErrors;
      if (res && typeof (res as Promise<unknown>).then === 'function') { setBusy(true); r = await res; setBusy(false); } else r = res as void | string | FormErrors;
      if (r && (typeof r === 'string' || Object.keys(r).length)) { show(r); return; }
      closeModal();
    } catch (err) { setBusy(false); show((err as Error)?.message || 'Terjadi kesalahan.'); }
  };
  return (
    <ErrCtx.Provider value={errors}>
      <form ref={formRef} id="bsModalForm" noValidate onSubmit={handle}>
        <header className="bs-modal-head"><div><h2 id="bsModalTitle">{title}</h2>{desc && <p>{desc}</p>}</div><Btn icon="x" variant="icon ghost" title="Tutup" onClick={closeModal} /></header>
        <div className="bs-modal-body">{children}<p className="bs-form-error" id="bsFormError" role="alert">{formError || error}</p></div>
        <footer className="bs-modal-foot">
          {footer ?? <>
            <Btn label="Batal" variant="ghost" onClick={closeModal} data-cancel="" />
            {onSubmit && <button type="submit" className={cx('bs-btn', danger ? 'danger' : 'primary')} disabled={busy} aria-busy={busy || undefined}>{busy ? busyLabel : submit}</button>}
          </>}
        </footer>
      </form>
    </ErrCtx.Provider>
  );
}

/* ---------- Kolom formulir ---------- */
export interface FieldProps {
  name: string; label: ReactNode; type?: string; value?: string | number | boolean | null; options?: readonly Opt[]; hint?: ReactNode; full?: boolean;
  required?: boolean; disabled?: boolean; maxLength?: number; placeholder?: string; autoComplete?: string; min?: number; max?: number; onInput?: () => void; inputMode?: 'url' | 'numeric' | 'decimal' | 'email' | 'text';
}
export function Field({ name, label, type = 'text', value = '', options, hint = '', full = false, required = true, disabled, maxLength, placeholder, autoComplete, min, max, onInput, inputMode }: FieldProps) {
  const errors = useContext(ErrCtx);
  const err = errors[name];
  const common = { name, id: `f-${name}`, disabled, 'aria-invalid': err ? true : undefined, 'aria-describedby': `h-${name}` } as const;
  if (type === 'checkbox') return <label className={cx('bs-checkline', full && 'full')}><input type="checkbox" name={name} id={`f-${name}`} defaultChecked={!!value} disabled={disabled} /><span>{label}</span></label>;
  const control = type === 'select'
    ? <select {...common} defaultValue={String(value ?? '')} required={required}><Options xs={options || []} /></select>
    : type === 'textarea'
      ? <textarea {...common} rows={3} defaultValue={String(value ?? '')} required={required} maxLength={maxLength} placeholder={placeholder} />
      : <input {...common} type={type} defaultValue={value == null ? '' : String(value)} step={type === 'number' ? 'any' : undefined} required={required} maxLength={maxLength} placeholder={placeholder} autoComplete={autoComplete} min={min} max={max} onInput={onInput} inputMode={inputMode} />;
  return (
    <div className={cx('bs-field', full && 'full')}>
      <label htmlFor={`f-${name}`}>{label}</label>{control}
      <small className={cx('bs-field-hint', err && 'is-error')} id={`h-${name}`}>{err || hint}</small>
    </div>
  );
}
export const FormGrid = ({ children }: { children: ReactNode }) => <div className="bs-form-grid">{children}</div>;

/* ---------- Konfirmasi aksi berbahaya ----------
 * Judul menyebut objeknya, isi menjelaskan dampaknya, lalu kalimat penutup apakah bisa dibatalkan.
 * Fokus awal di “Batal” supaya Enter tidak langsung menjalankan aksi.
 *   undo: false → “Tindakan ini tidak bisa dibatalkan.” · 'any' → bisa diurungkan lewat notifikasi · string → kalimat khusus */
export function confirmModal(title: string, text: ReactNode, confirm: string, run: () => void | Promise<unknown>, { danger = true, undo = false as boolean | 'any' | string } = {}) {
  const canUndo = undo === 'any';
  const note = typeof undo === 'string' && undo !== 'any' ? undo : canUndo ? 'Anda bisa mengurungkannya lewat tombol “Urungkan” di notifikasi.' : 'Tindakan ini tidak bisa dibatalkan.';
  openModal(
    <FormModal title={title} submit={confirm} danger={danger} initialFocus={danger ? 'cancel' : 'first'} onSubmit={async () => { await run(); }}>
      {typeof text === 'string' ? <p>{text}</p> : text}
      {danger && <p className="bs-confirm-note" data-tone={canUndo || (typeof undo === 'string' && undo !== 'any') ? 'info' : 'bad'}><Ic name={canUndo ? 'undo' : 'alert'} /><span>{note}</span></p>}
    </FormModal>
  );
}

/** Modal catatan singkat (tindak lanjut, temuan, alasan penolakan). */
export function noteModal(title: string, label: string, onSave: (text: string) => void | Promise<unknown>, value = '') {
  openModal(
    <FormModal title={title} submit="Simpan catatan" onSubmit={async fd => { const t = String(fd.get('text') || '').trim(); if (!t) return { text: 'Catatan wajib diisi.' }; await onSave(t); }}>
      <FormGrid><Field name="text" label={label} type="textarea" value={value} full maxLength={500} /></FormGrid>
    </FormModal>
  );
}

/** Modal informasi sederhana dengan tombol Tutup. */
export function infoModal(title: string, body: ReactNode, wide = false) {
  openModal(<FormModal title={title} wide={wide} footer={<Btn label="Tutup" variant="primary" onClick={closeModal} />}>{body}</FormModal>);
}
