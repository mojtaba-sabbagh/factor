"use client";

import { useEffect, useRef, useState } from "react";
import { PERSIAN_MONTHS, jalaliMonthLength, toGregorian, toJalali } from "../../utils/jalali";

const WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

function parseValue(value: string) {
  if (!value) return null;
  const parts = value.split("/").map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;
  const [jy, jm, jd] = parts;
  return { jy, jm, jd };
}

function todayJalali() {
  const now = new Date();
  return toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function weekdayOfFirst(jy: number, jm: number) {
  const { gy, gm, gd } = toGregorian(jy, jm, 1);
  const day = new Date(gy, gm - 1, gd).getDay();
  return (day + 1) % 7;
}

function formatValue(jy: number, jm: number, jd: number) {
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

export default function JalaliDatePicker({
  value,
  onChange,
  placeholder,
  allowClear = true,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => parseValue(value) || todayJalali());
  const rootRef = useRef<HTMLDivElement>(null);

  function openPicker() {
    setView(parseValue(value) || todayJalali());
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selected = parseValue(value);

  function goMonth(delta: number) {
    setView((prev) => {
      let jm = prev.jm + delta;
      let jy = prev.jy;
      if (jm < 1) {
        jm = 12;
        jy -= 1;
      } else if (jm > 12) {
        jm = 1;
        jy += 1;
      }
      // Spread prev so the day-of-month part of the view state is preserved;
      // returning only { jy, jm } breaks the { jy, jm, jd } state shape.
      return { ...prev, jy, jm };
    });
  }

  function pickDay(jd: number) {
    onChange(formatValue(view.jy, view.jm, jd));
    setOpen(false);
  }

  function pickToday() {
    const t = todayJalali();
    onChange(formatValue(t.jy, t.jm, t.jd));
    setOpen(false);
  }

  const daysInMonth = jalaliMonthLength(view.jy, view.jm);
  const startOffset = weekdayOfFirst(view.jy, view.jm);
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  return (
    <div className="jdp-root" ref={rootRef}>
      <div className="jdp-input-wrap">
        <input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          onFocus={openPicker}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="jdp-toggle"
          onClick={() => (open ? setOpen(false) : openPicker())}
          aria-label="انتخاب تاریخ"
        >
          📅
        </button>
      </div>
      {open && (
        <div className="jdp-popup">
          <div className="jdp-header">
            <button type="button" className="jdp-nav" onClick={() => goMonth(-1)}>
              ›
            </button>
            <div className="jdp-title">
              {PERSIAN_MONTHS[view.jm - 1]} {view.jy}
            </div>
            <button type="button" className="jdp-nav" onClick={() => goMonth(1)}>
              ‹
            </button>
          </div>
          <div className="jdp-weekdays">
            {WEEKDAYS.map((w) => (
              <div key={w} className="jdp-weekday">
                {w}
              </div>
            ))}
          </div>
          <div className="jdp-days">
            {cells.map((d, i) => {
              if (d === null) return <div key={`empty-${i}`} className="jdp-day jdp-day-empty" />;
              const isSelected =
                selected && selected.jy === view.jy && selected.jm === view.jm && selected.jd === d;
              return (
                <button
                  type="button"
                  key={d}
                  className={`jdp-day${isSelected ? " jdp-day-selected" : ""}`}
                  onClick={() => pickDay(d)}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="jdp-footer">
            <button type="button" className="jdp-link" onClick={pickToday}>
              امروز
            </button>
            {allowClear && (
              <button
                type="button"
                className="jdp-link"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                پاک کردن
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
