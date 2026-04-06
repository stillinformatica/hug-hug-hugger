import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { ptBR } from "date-fns/locale";

interface Props {
  eventDates: Date[];
  onDateSelect?: (date: Date | undefined) => void;
  selectedDate?: Date;
}

export const TravelCalendar = ({ eventDates, onDateSelect, selectedDate }: Props) => {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-2 flex justify-center">
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={onDateSelect}
        locale={ptBR}
        modifiers={{ event: eventDates }}
        modifiersClassNames={{
          event: "!bg-travel/20 !text-travel font-bold ring-2 ring-travel/40 rounded-lg",
        }}
        className={cn("p-2 pointer-events-auto")}
      />
    </div>
  );
};
