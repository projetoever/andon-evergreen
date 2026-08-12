import { TechnicianIdentificationModal } from "./TechnicianIdentificationModal";

interface StartAttendanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callId: string | null;
}

export function StartAttendanceModal({
  open,
  onOpenChange,
  callId,
}: StartAttendanceModalProps) {
  return (
    <TechnicianIdentificationModal
      open={open}
      onOpenChange={onOpenChange}
      callId={callId}
      purpose="start"
    />
  );
}
