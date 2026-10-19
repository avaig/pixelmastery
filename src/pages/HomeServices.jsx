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
            const content = service.featured ? <><div className="relative -mx-5 -mt-5 mb-4 overflow-hidden rounded-t-2xl bg-gradient-to-br from-[#fff5d8] via-[#ffe7ae] to-[#f8c46b] px-4 pb-4 pt-5"><div className="pointer-events-none absolute -right-5 -top-7 size-28 rounded-full border-[14px] border-white/25"/><div className="pointer-events-none absolute -bottom-9 -left-4 size-24 rounded-full bg-orange-300/30"/><div className="relative mx-auto flex size-[76px] items-center justify-center rounded-[26px] border border-white/80 bg-white/85 text-[#9a4108] shadow-[0_8px_24px_rgba(146,64,14,0.16)]"><ApperIcon name="Flower2" size={39} strokeWidth={1.8}/><span className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-[#fff0c8] bg-[#0f766e] text-white"><ApperIcon name="Check" size={14} strokeWidth={3}/></span></div><div className="relative mt-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#92400e]">PUJA • KATHA • HAWAN</div></div><div className="text-base font-black leading-tight text-[#102c4d]">PanditG On Call</div><p className="mx-auto mt-2 max-w-[220px] text-xs leading-relaxed text-slate-600">Trusted pandit for puja and ceremonies at home</p><div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#0f766e] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition group-hover:bg-[#115e59]">Get LOCAL Help <ApperIcon name="ArrowUpRight" size={15}/></div></> : <><div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#102c4d] text-white"><ApperIcon name={service.icon} size={24} /></div><div className="mt-4 text-sm font-extrabold leading-tight text-[#102c4d]">{tr(service.label, language)}</div>{service.href ? <div className="mt-3 text-xs font-semibold text-teal-700">Get LOCAL Help <ApperIcon name="ArrowUpRight" size={13} className="inline" /></div> : <div className="mt-3 text-xs font-medium text-slate-400">{tr('Coming Soon', language)}</div>}</>;
            const classes = 'group overflow-hidden rounded-2xl border bg-white p-5 text-center shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ' + (service.featured ? 'border-amber-300 shadow-[0_5px_18px_rgba(180,83,9,0.10)] hover:border-amber-500' : 'border-slate-200 hover:border-teal-600');
            return service.href ? <Link key={service.label} to={service.href} className={classes}>{content}</Link> : <div key={service.label} aria-disabled="true" className={classes + ' opacity-70'}>{content}</div>;
          })}
        </div>
      </main>
    </div>
  );
}