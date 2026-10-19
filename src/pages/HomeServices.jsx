import { Link } from 'react-router-dom';
import ApperIcon from '@/components/ApperIcon';
import { getLanguage, tr } from '@/services/i18n';

const homeServices = [
  { icon: 'Flower2', label: 'PanditG On Call', href: '/customer/home-services/panditg-on-call', featured: true },
  { icon: 'Snowflake', label: 'AC Technician', href: '/customer/home-services/ac-technician' },
  { icon: 'Zap', label: 'Electrician' },
  { icon: 'Droplets', label: 'Plumber' },
  { icon: 'Hammer', label: 'Carpenter' },
  { icon: 'Wrench', label: 'Appliance Repair' },
  { icon: 'Waves', label: 'RO / Water Purifier' },
  { icon: 'Sparkles', label: 'Home Cleaning' },
  { icon: 'Paintbrush', label: 'Painter' },
  { icon: 'Bug', label: 'Pest Control' },
  { icon: 'KeyRound', label: 'Locksmith' },
];

export const route = { path: '/customer/home-services', layout: 'public', access: 'public' };

export default function HomeServices() {
  const language = getLanguage();
  return (
    <div className="min-h-svh bg-[#f7f9fc] text-[#102c4d]">
      <main className="mx-auto max-w-5xl px-5 py-6 sm:px-8 sm:py-10">
        <div className="mb-6 flex justify-start"><Link to="/" aria-label={tr('Back to Home', language)} className="flex size-10 items-center justify-center rounded-full border border-slate-200 bg-white text-[#102c4d] shadow-sm transition hover:border-[#102c4d] hover:bg-slate-50"><ApperIcon name="ArrowLeft" size={19} /></Link></div>
        <div className="text-center"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{tr('Home Services', language)}</p><h1 className="mt-3 text-3xl font-black tracking-tight text-[#102c4d] sm:text-4xl">{tr('Choose a Service', language)}</h1><p className="mx-auto mt-3 max-w-xl text-sm text-slate-600">Choose a home service to find suitable nearby help.</p></div>
        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {homeServices.map((service) => {
            const content = <><div className={'mx-auto flex size-12 items-center justify-center rounded-2xl ' + (service.featured ? 'bg-amber-100 text-amber-800' : 'bg-[#102c4d] text-white')}><ApperIcon name={service.icon} size={24} /></div><div className="mt-4 text-sm font-extrabold leading-tight text-[#102c4d]">{tr(service.label, language)}</div>{service.href ? <div className="mt-3 text-xs font-semibold text-teal-700">Get LOCAL Help <ApperIcon name="ArrowUpRight" size={13} className="inline" /></div> : <div className="mt-3 text-xs font-medium text-slate-400">{tr('Coming Soon', language)}</div>}</>;
            const classes = 'rounded-2xl border bg-white p-5 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ' + (service.featured ? 'border-amber-300 hover:border-amber-500' : 'border-slate-200 hover:border-teal-600');
            return service.href ? <Link key={service.label} to={service.href} className={classes}>{content}</Link> : <div key={service.label} aria-disabled="true" className={classes + ' opacity-70'}>{content}</div>;
          })}
        </div>
      </main>
    </div>
  );
}