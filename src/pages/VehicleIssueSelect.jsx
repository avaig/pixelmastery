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

  function handleIssue(issue) {
    const params = new URLSearchParams({
      vehicle,
      issue,
    });
    navigate('/customer/request?' + params.toString());
  }

  return (
    <div className="mx-auto -mt-3 max-w-5xl sm:mt-0">
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
      <div className="mb-3 text-center sm:mb-5">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {tr(config.title, language)}
        </h1>
      </div>
      <div className="grid grid-cols-1 items-stretch gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {config.issues.filter(([label]) => label !== 'Accident / Recovery' && !(vehicle === 'bike' && label === 'Out of Fuel')).map(([label, icon]) => {
          const cardTitle = vehicle === 'car' && label === 'Out of Fuel' ? 'Diesel on Demand' : label;
          return (
          <button key={label} type="button" onClick={() => handleIssue(label)} className="w-full text-left">
            <Card className="flex h-full min-h-[80px] flex-row items-center gap-3 rounded-2xl border border-border/70 p-3 shadow-sm transition-all hover:border-primary/40 hover:shadow-md sm:min-h-[100px] sm:p-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#132F55] text-white">
                <ApperIcon name={icon} size={25} />
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="break-words font-semibold leading-snug">{tr(cardTitle, language)}</div>
                  {label === 'Towing Required' && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {tr('Rates as per time, place and type of towing', language)}
                    </p>
                  )}
                  {label === 'Out of Fuel' && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {tr(vehicle === 'car' ? 'Diesel Assistance At Your Location' : 'Fuel cost plus delivery fee', language)}
                    </p>
                  )}
                </div>
                <ApperIcon name="ArrowRight" size={18} className="mb-0.5 shrink-0 text-muted-foreground" />
              </div>
            </Card>
          </button>
          );
        })}
        <button
          type="button"
          onClick={() => handleIssue('Emergency Car Rental')}
          className="w-full text-left"
        >
          <Card className="flex min-h-[80px] h-full flex-row items-center gap-3 rounded-2xl border border-border/70 p-3 shadow-sm transition-all hover:border-primary/40 hover:shadow-md sm:min-h-[100px] sm:p-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#132F55] text-white">
              <ApperIcon name="CarTaxiFront" size={25} />
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="break-words font-semibold leading-snug">{tr('Emergency Car Rental', language)}</div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{tr('Request a rental quote from available providers and negotiate before booking.', language)}</p>
              </div>
              <ApperIcon name="ArrowRight" size={18} className="mb-0.5 shrink-0 text-muted-foreground" />
            </div>
          </Card>
        </button>
      </div>
    </div>
  );
}