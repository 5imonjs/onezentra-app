'use client';

import { useState, useMemo } from 'react';

interface CalendarEvent {
  date: string;
  count: number;
  status?: string;
}

interface CalendarProps {
  events?: CalendarEvent[];
  onDateClick?: (date: string) => void;
  selectedDate?: string;
}

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export default function Calendar({ events = [], onDateClick, selectedDate }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const today = new Date();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const formatDate = (day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const getEventsForDate = (date: string) => {
    return events.filter(e => e.date === date);
  };

  const isToday = (day: number) => {
    return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
  };

  const isSelected = (day: number) => {
    return selectedDate === formatDate(day);
  };

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  }, [firstDay, daysInMonth]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sticky top-6" role="region" aria-label="Kalender pengiriman">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">Kalender Kirim</h3>
            <p className="text-[11px] text-slate-500">Jadwal per tanggal</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            aria-label={`Bulan sebelumnya: ${MONTHS[month === 0 ? 11 : month - 1]}`}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-700 min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={nextMonth}
            aria-label={`Bulan berikutnya: ${MONTHS[month === 11 ? 0 : month + 1]}`}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-700 min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Month label */}
      <div className="mb-3">
        <p className="text-sm font-bold text-slate-800">{MONTHS[month]} {year}</p>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-1 mb-1" role="row">
        {DAYS.map((day) => (
          <div key={day} className="text-center text-[11px] font-semibold text-slate-500 py-2" role="columnheader" aria-label={day}>
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`Kalender ${MONTHS[month]} ${year}`}>
        {calendarDays.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} className="aspect-square" role="gridcell" aria-hidden="true" />;
          }

          const dateStr = formatDate(day);
          const dayEvents = getEventsForDate(dateStr);
          const hasEvents = dayEvents.length > 0;

          return (
            <button
              key={day}
              onClick={() => onDateClick?.(dateStr)}
              aria-label={`${day} ${MONTHS[month]} ${year}${hasEvents ? `, ${dayEvents.length} jadwal` : ''}`}
              aria-selected={isSelected(day)}
              role="gridcell"
              className={`aspect-square rounded-lg flex flex-col items-center justify-center transition-all relative group ${
                isToday(day)
                  ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm shadow-primary-600/30'
                  : isSelected(day)
                  ? 'bg-primary-50 text-primary-700 ring-2 ring-primary-500 font-semibold'
                  : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <span className={`text-sm ${isToday(day) ? 'font-bold' : 'font-medium'}`}>
                {day}
              </span>
              {hasEvents && (
                <div className={`flex gap-0.5 mt-1`}>
                  {dayEvents.slice(0, 4).map((event, i) => (
                    <div
                      key={i}
                      className={`w-1 h-1 rounded-full ${
                        isToday(day)
                          ? 'bg-white'
                          : event.status === 'DRAFT'
                          ? 'bg-gray-400'
                          : event.status === 'SCHEDULED'
                          ? 'bg-blue-500'
                          : event.status === 'COMPLETED'
                          ? 'bg-green-500'
                          : event.status === 'CANCELLED'
                          ? 'bg-red-500'
                          : 'bg-yellow-500'
                      }`}
                    />
                  ))}
                </div>
              )}
              {hasEvents && (
                <span className={`absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-[1.25rem] px-1 text-[10px] font-bold rounded-full flex items-center justify-center border-2 ${
                  isToday(day) ? 'bg-white text-primary-600 border-primary-100' : 'bg-primary-500 text-white border-white'
                }`}>
                  {dayEvents.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 mt-5 pt-4 border-t border-slate-100" aria-label="Legenda warna status">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-gray-400" aria-hidden="true" />
          <span className="text-[11px] text-slate-600">Draft</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-500" aria-hidden="true" />
          <span className="text-[11px] text-slate-600">Dijadwalkan</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />
          <span className="text-[11px] text-slate-600">Completed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" aria-hidden="true" />
          <span className="text-[11px] text-slate-600">Cancelled</span>
        </div>
      </div>
    </div>
  );
}
