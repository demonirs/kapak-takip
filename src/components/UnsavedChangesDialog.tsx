import { AlertTriangle } from 'lucide-react';

type UnsavedChangesDialogProps = {
  open: boolean;
  onContinueEditing: () => void;
  onLeave: () => void;
};

export default function UnsavedChangesDialog({
  open,
  onContinueEditing,
  onLeave,
}: UnsavedChangesDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/85 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-changes-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-400/35 bg-slate-900 shadow-2xl shadow-amber-500/10">
        <div className="flex items-start gap-3 border-b border-slate-800 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 text-amber-300">
            <AlertTriangle className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <h2
              id="unsaved-changes-title"
              className="text-lg font-bold text-white"
            >
              Kaydedilmemiş değişiklikler
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Kaydedilmemiş değişiklikler var. Sayfadan ayrılmak
              istiyor musunuz?
            </p>
          </div>
        </div>

        <div className="grid gap-2 p-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={onContinueEditing}
            className="button-secondary w-full"
          >
            Düzenlemeye Devam Et
          </button>

          <button
            type="button"
            onClick={onLeave}
            className="button-warning w-full"
          >
            Sayfadan Ayrıl
          </button>
        </div>
      </div>
    </div>
  );
}
