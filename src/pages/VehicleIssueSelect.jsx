import { useNavigate, useParams } from 'react-router-dom';
import ApperIcon from '@/components/ApperIcon';
import { getLanguage, tr } from '@/services/i18n';
import { Card } from '@/components/ui/card';

export const route = {
  path: '/customer/vehicle/:vehicle',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

const vehicleConfig = {
  car: {
    title: 'Select Your Car Issue',
    icon: 'Car',
    issues: [
      ['Battery Jump Start', 'Battery'],
      ['Flat Tyre / Puncture', 'CircleDot'],
      ['Out of Fuel', 'Fuel'],
      ['Key Locked / Lockout', 'KeyRound'],
      ['Towing Required', 'Truck'],
    ],
  },
  bike: {
    title: 'Select Your Bike Issue',
    icon: 'Bike',
    issues: [
      ['Battery / Won’t Start', 'Battery'],
      ['Flat Tyre / Puncture', 'CircleDot'],
      ['Chain / Drive Problem', 'Link2'],
      ['Clutch / Gear Problem', 'Cog'],
      ['Out of Fuel', 'Fuel'],
      ['Towing Required', 'Truck'],
    ],
  },
};

export default function VehicleIssueSelect() {
  const { vehicle } = useParams();
  const navigate = useNavigate();
  const config = vehicleConfig[vehicle];
  const language = getLanguage();

  if (!config) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <div className="font-semibold">{tr('Vehicle type not found.', language)}</div>
          <button type="button" className="mt-4 text-sm font-medium text-primary hover:underline" onClick={() => navigate('/customer')}>
            {tr('Back to home', language)}
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto -mt-2 max-w-5xl sm:mt-0">
      <div className="mb-1 flex justify-start sm:mb-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate('/customer')}
          className="flex size-10 items-center justify-center rounded-full border bg-background text-foreground shadow-sm transition hover:border-primary hover:text-primary"
        >
          <ApperIcon name="ArrowLeft" size={19} />
        </button>
      </div>
      <Card className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-[#F4F8FC] p-4 shadow-sm sm:mb-7 sm:p-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#132F55] text-white sm:size-16">
            <ApperIcon name="Headset" size={30} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-[#102C4D] sm:text-2xl">{tr('LOCAL 24×7 Roadside Support', language)}</h1>
            <div className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-emerald-700 sm:text-base">
              <span className="size-2.5 rounded-full bg-emerald-500" />
              {tr('Available Day & Night', language)}
            </div>
          </div>
        </div>
        <a href="tel:9235559696" className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-center text-base font-extrabold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 sm:text-lg">
          <ApperIcon name="PhoneCall" size={22} />
          <span>{tr('CALL LOCAL SUPPORT', language)} · 9235559696</span>
        </a>
        <p className="mt-2 text-center text-xs text-slate-500 sm:text-sm">{tr('One call. Help on the way.', language)}</p>
      </Card>
      <div className="mb-3 sm:mb-4">
        <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">{tr('Roadside issues we can help with', language)}</h2>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">{tr('These are examples of issues our support team can assist with. Call us to get help.', language)}</p>
      </div>
      <div className="grid grid-cols-1 items-stretch gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {config.issues.filter(([label]) => label !== 'Accident / Recovery' && !(vehicle === 'bike' && label === 'Out of Fuel')).map(([label, icon]) => {
          const cardTitle = vehicle === 'car' && label === 'Out of Fuel' ? 'Diesel on Demand' : label;
          return (
            <div key={label} className="min-w-0">
              <Card className="flex h-full min-h-[80px] flex-row items-center gap-3 rounded-2xl border border-border/70 bg-white p-3 shadow-sm sm:min-h-[100px] sm:p-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#132F55] text-white">
                  <ApperIcon name={icon} size={25} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="break-words text-[17px] font-semibold leading-snug text-foreground sm:text-lg">{tr(cardTitle, language)}</div>
                  {label === 'Towing Required' && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      {tr('Rates as per time, place and type of towing', language)}
                    </p>
                  )}
                  {label === 'Out of Fuel' && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      {tr(vehicle === 'car' ? 'Diesel Assistance At Your Location' : 'Fuel cost plus delivery fee', language)}
                    </p>
                  )}
                </div>
              </Card>
            </div>
          );
        })}
        {vehicle === 'car' && (
          <div className="min-w-0">
            <Card className="flex h-full min-h-[80px] flex-row items-center gap-3 rounded-2xl border border-border/70 bg-white p-3 shadow-sm sm:min-h-[100px] sm:p-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#132F55] text-white">
                <ApperIcon name="Wrench" size={25} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="break-words text-[17px] font-semibold leading-snug text-foreground sm:text-lg">{tr('Mechanical issues', language)}</div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}