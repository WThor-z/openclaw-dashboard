import React from "react";

export type EventItem = {
  id: string;
  createdAt: string;
  kind: string;
  level: string;
  source: string;
};

type EventsPanelProps = {
  events: EventItem[];
  filterValue: string;
  onFilterChange: (nextValue: string) => void;
};

export function EventsPanel({ events, filterValue, onFilterChange }: EventsPanelProps) {
  return (
    <section aria-label="Events panel">
      <h2>Events</h2>
      <label htmlFor="events-filter-input">Filter events</label>
      <input
        id="events-filter-input"
        data-testid="events-filter-input"
        type="text"
        value={filterValue}
        onChange={(event) => onFilterChange(event.target.value)}
      />
      <ul>
        {events.map((entry) => (
          <li data-testid="event-row" key={entry.id}>
            <strong>{entry.kind}</strong> [{entry.level}] {entry.source} - {entry.createdAt}
          </li>
        ))}
      </ul>
    </section>
  );
}
