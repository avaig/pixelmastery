import { useNavigate } from 'react-router-dom';
import ApperIcon from '@/components/ApperIcon';
import { Card } from '@/components/ui/card';
import { getLanguage, tr } from '@/services/i18n';

export const route = {
  path: '/customer/car-care',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

const services = [
  {
    title: 'Car Wash',
    description: 'Exterior and interior car cleaning',
    icon: 'Droplets',
    href: '/customer/request?vehicle=car&issue=Other%20Issue&service=Car%20Wash',
  },
  {
    title: 'Car Service',
    description: 'Routine maintenance and servicing',
    icon: 'Settings',
    href: '/customer/request?vehicle=car&issue=Other%20Issue&service=Car%20Service',
  },
  {
    title: 'Car Essentials at Your Doorstep',
    description: 'Essential Car Fluids Delivered to Your Location',
    icon: 'PackageCheck',
    href: '/customer/car-essentials',
  },
  {
    title: 'Roadside Assistance (RSA)',
    description: 'Breakdown, battery, puncture, fuel and towing help',
    icon: 'Truck',
    href: '/customer/vehicle/car',
  },
  {
    title: 'Insurance Claim',
    description: 'Get help with the next steps after car damage or an accident',
    icon: 'FileCheck',
    href: '/customer/request?vehicle=car&issue=Other%20Issue&service=Insurance%20Claim%20Assistance',
  },
];

export default function CarCareAssistance() {
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
          <ApperIcon name="CarFront" size={34} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {tr('Car Care & Assistance', language)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {tr('What Does Your Car Need?', language)}
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-5 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
        {services.map((service) => {
          const content = (
            <Card className={'flex h-full min-h-[220px] w-full min-w-0 flex-col border-2 p-5 transition-all sm:min-h-[220px] sm:p-6 ' + 'hover:-translate-y-1 hover:border-primary hover:shadow-md'}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ApperIcon name={service.icon} size={30} />
                </div>
                <ApperIcon name="ArrowUpRight" size={20} className="text-muted-foreground" />
              </div>
              <div className="mt-5 font-heading text-lg font-semibold leading-snug">
                {tr(service.title, language)}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {tr(service.description, language)}
              </p>
            </Card>
          );

          return (
            <button key={service.title} type="button" onClick={() => navigate(service.href)} className="flex h-full min-w-0 w-full text-left">
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
