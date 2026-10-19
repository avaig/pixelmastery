import { useNavigate } from 'react-router-dom';
import ApperIcon from '@/components/ApperIcon';
import { Card } from '@/components/ui/card';
import { getLanguage, tr } from '@/services/i18n';

export const route = {
  path: '/customer/bike-care',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

const services = [
  {
    title: 'Bike Repair & Roadside Assistance',
    description: 'Battery, puncture, chain, clutch, fuel and towing help',
    icon: 'Wrench',
    href: '/customer/vehicle/bike',
  },
  {
    title: 'Bike Maintenance',
    description: 'Routine bike inspection and servicing',
    icon: 'Settings',
    href: '/customer/request?vehicle=bike&issue=Other%20Issue&service=Bike%20Service',
  },
];

export default function BikeCareAssistance() {
  const navigate = useNavigate();
  const language = getLanguage();

  return (
    <div className="mx-auto -mt-3 max-w-5xl sm:mt-0">
      <button
        type="button"
        aria-label="Back"
        onClick={() => navigate('/')}
        className="mb-1 flex size-10 items-center justify-center rounded-full border bg-background text-foreground shadow-sm transition hover:border-primary hover:text-primary sm:mb-3"
      >
        <ApperIcon name="ArrowLeft" size={19} />
      </button>

      <div className="mb-3 text-center sm:mb-5">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary sm:mb-3 sm:size-14">
          <ApperIcon name="Bike" size={28} />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {tr('Bike Care & Assistance', language)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          {tr('What Does Your Bike Need?', language)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4">
        {services.map((service) => (
          <button key={service.title} type="button" onClick={() => navigate(service.href)} className="w-full text-left">
            <Card className="flex min-h-[88px] flex-row items-center gap-3 rounded-2xl border border-border/70 p-3 shadow-sm transition-all hover:border-primary/40 hover:shadow-md sm:min-h-[96px] sm:gap-4 sm:p-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#132F55] text-white sm:size-14">
                <ApperIcon name={service.icon} size={27} />
                </div>
                <div className="min-w-0 flex-1 font-heading text-base font-bold leading-snug sm:text-lg">{tr(service.title, language)}</div>
                <ApperIcon name="ArrowRight" size={22} className="ml-auto shrink-0 text-[#132F55]" />
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
