import { toast } from 'sonner';
import { t3 } from '@/lib/inlineI18n';

/**
 * Shows an undo toast for 10 seconds. If the user doesn't click undo,
 * the onConfirm callback is executed. If they click undo, nothing happens.
 */
export function undoableDelete({
  label,
  onConfirm,
  onUndo,
  duration = 10000,
}: {
  label: string;
  onConfirm: () => void | Promise<void>;
  onUndo?: () => void;
  duration?: number;
}) {
  let cancelled = false;

  const toastId = toast(label, {
    duration,
    action: {
      label: t3('Fortryd', 'Undo', 'Rückgängig'),
      onClick: () => {
        cancelled = true;
        onUndo?.();
        toast.dismiss(toastId);
        toast.success(t3('Handling fortrudt', 'Action undone', 'Aktion rückgängig gemacht'));
      },
    },
    onDismiss: () => {
      if (!cancelled) {
        onConfirm();
      }
    },
    onAutoClose: () => {
      if (!cancelled) {
        onConfirm();
      }
    },
  });

  return toastId;
}
