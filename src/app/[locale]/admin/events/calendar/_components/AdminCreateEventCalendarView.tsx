'use client'

import type { DateSelectArg, EventClickArg, EventInput } from '@fullcalendar/core'
import type { DateClickArg } from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'

interface AdminCreateEventCalendarViewProps {
  events: EventInput[]
  onDateClick: (info: DateClickArg) => void
  onSelect: (selection: DateSelectArg) => void
  onEventClick: (info: EventClickArg) => void
}

export default function AdminCreateEventCalendarView({
  events,
  onDateClick,
  onSelect,
  onEventClick,
}: AdminCreateEventCalendarViewProps) {
  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
      initialView="dayGridMonth"
      height="auto"
      selectable
      weekends
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,listMonth',
      }}
      buttonText={{
        today: 'Today',
        month: 'Month',
        week: 'Week',
        list: 'Agenda',
      }}
      events={events}
      dateClick={onDateClick}
      select={onSelect}
      eventClick={onEventClick}
      eventDidMount={(info) => {
        const fullLabel = info.timeText
          ? `${info.timeText} ${info.event.title}`
          : info.event.title
        info.el.setAttribute('title', fullLabel)
      }}
      dayMaxEventRows={3}
      eventTimeFormat={{
        hour: 'numeric',
        minute: '2-digit',
        meridiem: 'short',
      }}
    />
  )
}
