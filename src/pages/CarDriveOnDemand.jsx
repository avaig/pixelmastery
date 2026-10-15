import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ApperIcon from '@/components/ApperIcon';
import { Card } from '@/components/ui/card';

export const route = {
  path: '/customer/car-driver',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

const driverServices = [
  {
    title: 'Hourly Driver',
    description: '',
    detail: '',
    icon: 'Clock3',
    href: '/customer/request?vehicle=car&issue=Other%20Issue&service=Hourly%20Driver',
  },
  {
    title: 'Full-Day Driver',
    description: '',
    detail: '',
    icon: 'Sun',
    href: '/customer/request?vehicle=car&issue=Other%20Issue&service=Full-Day%20Driver',
  },
];

export default function CarDriveOnDemand() {
  const navigate = useNavigate();
  const [selectedService, setSelectedService] = useState('');

  return (
    <div className="mx-auto max-w-5xl">
      <button
        type="button"
        onClick={() => navigate('/customer/car-care')}
        className="mb-5 flex size-10 items-center justify-center rounded-full border bg-background text-foreground shadow-sm transition hover:border-primary hover:text-primary"
        aria-label="Back to Car Care and Assistance"
      >
        <ApperIcon name="ArrowLeft" size={19} />
      </button>

      <div className="mb-7 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ApperIcon name="CarTaxiFront" size={34} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Car Driver on Demand
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Choose a driver service for your own car.
        </p>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2">
        {driverServices.map((service) => {
          const selected = selectedService === service.title;
          return (
            <button
              key={service.title}
              type="button"
              onClick={() => navigate(service.href)}
              aria-pressed={selected}
              className="flex h-full w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Card className={'flex h-full min-h-[360px] w-full flex-col border-2 p-5 text-left transition-all sm:min-h-[380px] sm:p-6 ' + (selected ? 'border-primary bg-primary/5 shadow-md' : 'hover:-translate-y-1 hover:border-primary hover:shadow-md')}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <ApperIcon name={service.icon} size={29} />
                    </div>
                    <div className="font-heading text-lg font-semibold leading-snug">{service.title}</div>
                  </div>
                  <ApperIcon name={selected ? 'CircleCheck' : 'ArrowUpRight'} size={20} className={selected ? 'text-primary' : 'text-muted-foreground'} />
                </div>
                {service.title === 'Full-Day Driver' && (
                  <div className="mt-3 rounded-lg bg-primary/5 px-3 py-3 text-sm leading-6 text-foreground">
                    <p className="mb-2"><span className="font-bold">₹100/hour</span> from 8 AM to 10 PM</p>
                    <p><span className="font-bold">₹300</span> night-halt charge</p>
                  </div>
                )}
                {service.title === 'Hourly Driver' && (
                  <div className="mt-3 rounded-lg bg-primary/5 px-3 py-3 text-sm leading-6 text-foreground">
                    <p className="mb-1.5"><span className="font-bold">₹300</span> minimum 2 hours</p>
                    <p className="mb-1.5"><span className="font-bold">₹100/hour</span> after the first 2 hours</p>
                    <p><span className="font-bold">₹300</span> night-halt charge</p>
                  </div>
                )}
                <details className="mt-4 rounded-lg border bg-background px-3 py-3 text-sm">
                  <summary className="cursor-pointer font-semibold text-foreground">Safety &amp; Liability Disclaimer</summary>
                  <div className="mt-3 space-y-2 leading-relaxed text-muted-foreground">
                    <p>LOCAL connects customers with professional drivers who drive the customer's own vehicle. The customer is responsible for ensuring that the vehicle is roadworthy and has valid insurance applicable to its intended use and the assigned driver.</p>
                    <p>The driver must hold a valid driving licence and comply with applicable traffic laws. LOCAL facilitates the connection and does not guarantee accident-free travel.</p>
                    <p>Any accident, injury, loss or damage will be handled according to applicable law and the relevant insurance policy. The driver and LOCAL are not exempt from liability that the law imposes, including liability arising from their own acts or omissions.</p>
                    <p className="text-xs">Please read the full Professional Driver Service terms before booking. This disclaimer does not remove any rights or responsibilities that cannot legally be excluded.</p>
                  </div>
                </details>
              </Card>
            </button>
          );
        })}
      </div>

    </div>
  );
}
