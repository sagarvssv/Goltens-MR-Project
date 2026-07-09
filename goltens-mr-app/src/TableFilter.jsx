/**
 * TableFilter.jsx — Excel-style column filters for MR tables
 * Supports both dropdown select and text search per column
 */
import { useState } from "react";
import { G } from "./theme";

export function useTableFilter(rows, columns) {
  const [filters, setFilters] = useState({});

  const filtered = rows.filter(row =>
    columns.every(col => {
      const fv = filters[col.key];
      if (!fv || fv === "") return true;
      const cell = String(row[col.key] || "").toLowerCase();
      return cell.includes(fv.toLowerCase());
    })
  );

  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  const clearFilters = () => setFilters({});
  const hasFilters = Object.values(filters).some(v => v && v !== "");

  return { filtered, filters, setFilter, clearFilters, hasFilters };
}

export default function TableFilterHeader({ columns, rows, filters, onFilter, onClear, hasFilters }) {
  return (
    <thead>
      {/* Column headers */}
      <tr>
        {columns.map(col => (
          <th key={col.key} style={s.th}>{col.label}</th>
        ))}
      </tr>
      {/* Filter row */}
      <tr style={{ background:"#f0f4f8" }}>
        {columns.map(col => {
          // Get unique values for dropdown
          const unique = [...new Set(rows.map(r => String(r[col.key] || "")).filter(Boolean))].sort();
          const isStatus = col.key === "status";
          const val = filters[col.key] || "";

          return (
            <td key={col.key} style={s.filterCell}>
              {unique.length <= 12 && unique.length > 0 ? (
                // Dropdown for low-cardinality columns
                <select style={{ ...s.filterInput, ...(val ? s.filterActive : {}) }}
                  value={val} onChange={e => onFilter(col.key, e.target.value)}>
                  <option value="">All</option>
                  {unique.map(u => (
                    <option key={u} value={u}>{isStatus ? u.replace(/_/g," ") : u}</option>
                  ))}
                </select>
              ) : (
                // Text search for high-cardinality columns
                <input style={{ ...s.filterInput, ...(val ? s.filterActive : {}) }}
                  placeholder="Filter…"
                  value={val}
                  onChange={e => onFilter(col.key, e.target.value)}
                />
              )}
            </td>
          );
        })}
      </tr>
      {/* Clear filters row */}
      {hasFilters && (
        <tr>
          <td colSpan={columns.length} style={{ padding:"4px 8px", background:"#fff8e1" }}>
            <button style={s.clearBtn} onClick={onClear}>✕ Clear all filters</button>
          </td>
        </tr>
      )}
    </thead>
  );
}

const s = {
  th:          { background:G.navy, color:"#fff", padding:"8px 10px", textAlign:"left", fontWeight:600, fontSize:11, whiteSpace:"nowrap" },
  filterCell:  { padding:"4px 6px", background:"#f0f4f8" },
  filterInput: { width:"100%", border:`1px solid ${G.paleBorder}`, borderRadius:4, padding:"4px 7px", fontSize:11, outline:"none", boxSizing:"border-box", fontFamily:"'Inter','Segoe UI',system-ui,Arial,sans-serif", background:"#fff" },
  filterActive:{ borderColor:G.primary, background:"#eaf4ff" },
  clearBtn:    { background:"none", border:"none", color:G.warning, fontSize:11, fontWeight:600, cursor:"pointer", padding:"0 4px" },
};
