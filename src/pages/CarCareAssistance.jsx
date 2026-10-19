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

      <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 sm:gap-5">
        {services.map((service) => (
          <button
            key={service.title}
            type="button"
            onClick={() => navigate(service.href)}
            className="group flex min-w-0 w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Card className="flex min-h-[104px] w-full min-w-0 items-center gap-3 rounded-xl border-2 p-3 transition-all hover:border-primary hover:shadow-md sm:min-h-[124px] sm:gap-4 sm:p-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-14">
                <ApperIcon name={service.icon} size={26} />
              </div>
              <div className="min-w-0 flex-1 py-1">
                <div className="font-heading text-base font-semibold leading-snug sm:text-lg">
                  {tr(service.title, language)}
                </div>
                <p className="mt-1 text-sm leading-snug text-muted-foreground sm:leading-relaxed">
                  {tr(service.description, language)}
                </p>
              </div>
              <ApperIcon name="ArrowUpRight" size={19} className="ml-auto shrink-0 self-start text-muted-foreground transition-colors group-hover:text-primary" />
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
