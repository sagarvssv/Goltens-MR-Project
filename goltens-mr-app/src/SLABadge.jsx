/**
 * SLABadge.jsx — Shows a red/orange warning badge on MRs that exceed SLA thresholds.
 * PENDING > 2 days, PENDING_HOD > 3 days, APPROVED (waiting SC) > 5 days
 */
import { G } from "./theme";

export const SLA_THRESHOLDS = { PENDING: 2, PENDING_HOD: 3, APPROVED: 5 };

export function getSLADays(mr) {
  if (!SLA_THRESHOLDS[mr.status]) return null;
  const submitted = new Date(mr.date_requested || mr.created_at);
  const days = Math.floor((Date.now() - submitted.getTime()) / 86400000);
  const threshold = SLA_THRESHOLDS[mr.status];
  if (days <= threshold) return null;
  return { days, threshold, overBy: days - threshold };
}

export default function SLABadge({ mr, compact = false }) {
  const sla = getSLADays(mr);
  if (!sla) return null;

  const urgent = sla.overBy >= 3;

  if (compact) {
    return (
      <span style={{
        background: urgent ? "#e53935" : "#ff7043",
        color: "#fff",
        borderRadius: 6,
        padding: "1px 6px",
        fontSize: 9,
        fontWeight: 700,
        marginLeft: 4,
        verticalAlign: "middle",
      }}>
        ⏱ {sla.days}d
      </span>
    );
  }

  return (
    <div style={{
      background: urgent ? "#fff5f5" : "#fff8f5",
      border: `1px solid ${urgent ? "#e53935" : "#ff7043"}`,
      borderRadius: 5,
      padding: "5px 10px",
      fontSize: 11,
      color: urgent ? "#c0392b" : "#e64a19",
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginTop: 4,
    }}>
      <span>⚠</span>
      <span>
        <strong>SLA Breach:</strong> {mr.status.replace(/_/g," ")} for {sla.days} days
        (threshold: {sla.threshold} days, over by {sla.overBy} day{sla.overBy !== 1 ? "s" : ""})
      </span>
    </div>
  );
}
