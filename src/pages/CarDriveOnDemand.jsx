import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ApperIcon from '@/components/ApperIcon';
import { Card } from '@/components/ui/card';

export const route = {
  path: '/customer/car-driver',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

const driverService = {
  title: 'Car Driver on Demand',
  icon: 'CarTaxiFront',
  href: '/customer/request?vehicle=car&issue=Other%20Issue&service=Car%20Driver%20on%20Demand',
};

export default function CarDriveOnDemand() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto -mt-2 max-w-5xl sm:mt-0">
      <button
        type="button"
        onClick={() => navigate('/customer/car-care')}
        className="mb-1 flex size-10 items-center justify-center rounded-full border bg-background text-foreground shadow-sm transition hover:border-primary hover:text-primary sm:mb-3"
        aria-label="Back to Car Care and Assistance"
      >
        <ApperIcon name="ArrowLeft" size={19} />
      </button>

      <div className="mb-3 text-center sm:mb-5">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary sm:mb-3 sm:size-14">
          <ApperIcon name="CarTaxiFront" size={28} />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Car Driver on Demand
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Choose a driver service for your own car.
        </p>
      </div>

      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={() => navigate(driverService.href)}
          className="flex w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Card className="flex w-full flex-col border-2 p-4 text-left transition-all hover:-translate-y-1 hover:border-primary hover:shadow-md sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ApperIcon name={driverService.icon} size={29} />
                </div>
                <div className="font-heading text-lg font-semibold leading-snug">{driverService.title}</div>
              </div>
              <ApperIcon name="ArrowUpRight" size={20} className="text-muted-foreground" />
            </div>
            <div className="mt-4 rounded-lg bg-primary/5 px-4 py-4 text-sm leading-6 text-foreground sm:text-base">
              <p className="mb-2"><span className="font-bold">₹800</span> for an 8-hour shift</p>
              <p className="mb-2"><span className="font-bold">₹50/hour</span> for every hour after the first 8 hours, until 10 PM</p>
              <div className="my-3 border-t border-primary/15" />
              <p className="font-semibold">After 10 PM</p>
              <p><span className="font-bold">₹100/hour</span> + <span className="font-bold">₹300 fixed night charge</span></p>
            </div>
            <details className="mt-4 rounded-lg border bg-background px-3 py-3 text-sm" onClick={(event) => event.stopPropagation()}>
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
      </div>

    </div>
  );
}
