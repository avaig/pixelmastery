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
    <div className="mx-auto max-w-5xl">
      <button
        type="button"
        aria-label="Back"
        onClick={() => navigate('/')}
        className="mb-5 flex size-10 items-center justify-center rounded-full border bg-background text-foreground shadow-sm transition hover:border-primary hover:text-primary"
      >
        <ApperIcon name="ArrowLeft" size={19} />
      </button>

      <div className="mb-7 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ApperIcon name="Bike" size={34} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {tr('Bike Care & Assistance', language)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {tr('What Does Your Bike Need?', language)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {services.map((service) => (
          <button key={service.title} type="button" onClick={() => navigate(service.href)} className="w-full text-left">
            <Card className="flex min-h-[170px] flex-col border-2 p-5 transition-all hover:-translate-y-1 hover:border-primary hover:shadow-md sm:min-h-[190px] sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ApperIcon name={service.icon} size={30} />
                </div>
                <ApperIcon name="ArrowUpRight" size={20} className="text-muted-foreground" />
              </div>
              <div className="mt-5 font-heading text-lg font-semibold leading-snug">{tr(service.title, language)}</div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tr(service.description, language)}</p>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
