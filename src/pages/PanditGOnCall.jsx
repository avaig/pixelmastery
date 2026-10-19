import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
const { eq } = window.ApperSDK.CoreSDK;
const PANDITG_LOGO = null; // Hosted asset URL will be added when the original image is uploaded.
const PUJAS = ['Griha Pravesh Puja', 'Satyanarayan Katha', 'Hawan / Homa', 'Daily Puja', 'Vastu Shanti Puja', 'Naming Ceremony', 'Other Puja'];
export const route = { path: '/customer/home-services/panditg-on-call', layout: 'owner', access: "profile === 'Customer_c'" };
export default function PanditGOnCall() {
  const navigate = useNavigate();
  const user = useSelector((state) => state.user.user);
  const email = String(user?.emailAddress ?? user?.email ?? '').trim().toLowerCase();
  const [puja, setPuja] = useState(PUJAS[0]);
  const [address, setAddress] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('Flexible');
  const [language, setLanguage] = useState('Hindi');
  const [samagri, setSamagri] = useState('Please advise');
  const [attendees, setAttendees] = useState('1–5 people');
  const [notes, setNotes] = useState('');
  const [coords, setCoords] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data: customer } = useFetch(async () => {
    if (!email) return null;
    const result = await sdk.table('customer_profiles_c').select(['Id', 'Name', 'email_c', 'location_c', 'latitude_c', 'longitude_c']).where(eq('email_c', email)).page(1, 1).fetch();
    if (!result.success) throw new Error(result.message);
    return result.data?.[0] ?? null;
  }, [email]);
  const { data: category } = useFetch(async () => {
    const result = await sdk.table('service_categories_c').select(['Id', 'Name']).where(eq('Name', 'Home Services')).page(1, 1).fetch();
    if (!result.success) throw new Error(result.message);
    return result.data?.[0] ?? null;
  }, []);
  function useSavedAddress() {
    if (!customer?.location_c) return toast.error('No saved address found. Please enter your address.');
    setAddress(customer.location_c);
    if (customer.latitude_c != null && customer.longitude_c != null) setCoords({ latitude: Number(customer.latitude_c), longitude: Number(customer.longitude_c) });
    toast.success('Saved address added. Please check it before submitting.');
  }
  function useCurrentLocation() {
    if (!navigator.geolocation) return toast.error('Location is unavailable. Please enter your address manually.');
    navigator.geolocation.getCurrentPosition((position) => {
      setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      setAddress((current) => current || customer?.location_c || 'Current location — add house and locality details');
      toast.success('Location captured. Please complete your address.');
    }, () => toast.error('Location permission was not granted. Please enter your address manually.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }
  async function submit(event) {
    event.preventDefault();
    if (!customer?.Id) return toast.error('Your customer profile could not be matched. Please complete your profile first.');
    if (!category?.Id) return toast.error('Home Services is not configured in LOCAL yet. Please contact support.');
    if (!address.trim()) return toast.error('Enter the full address where the puja will take place.');
    if (date && new Date(date + 'T12:00:00').getTime() < Date.now() - 60000) return toast.error('Choose a future date.');
    setBusy(true);
    try {
      const details = { version: 1, service: 'PanditG On Call', pujaType: puja, preferredDate: date || 'Next available', preferredTime: time, preferredLanguage: language, attendees, samagriPreference: samagri, specialInstructions: notes.trim(), serviceAddress: address.trim(), latitude: coords?.latitude ?? (customer?.latitude_c != null ? Number(customer.latitude_c) : null), longitude: coords?.longitude ?? (customer?.longitude_c != null ? Number(customer.longitude_c) : null), pricingNote: 'Provider must confirm ceremony inclusions and price before customer commitment. Travel, if any, is a separate disclosed charge.' };
      const payload = { Name: 'PanditG On Call • ' + puja, customer_c: customer.Id, service_category_c: category.Id, problem_description_c: 'LOCAL_PANDIT_REQUEST_JSON:' + JSON.stringify(details), location_c: address.trim(), service_area_c: 'Prayagraj', status_c: 'Open', preferred_time_c: date ? 'Scheduled' : 'ASAP', requested_at_c: new Date().toISOString(), service_mode_c: 'Normal', pricing_mode_c: 'Provider Quote', pricing_mode_description_c: 'PanditG On Call: confirm availability, ceremony inclusions and price before customer commitment. Show any travel charge separately.' };
      if (Number.isFinite(Number(details.latitude)) && Number.isFinite(Number(details.longitude))) { payload.latitude_c = Number(details.latitude); payload.longitude_c = Number(details.longitude); }
      if (date) payload.scheduled_at_c = new Date(date + 'T12:00:00').toISOString();
      const result = await sdk.table('service_requests_c').create(payload);
      if (!result.data?.length) return toast.error(result.messages?.[0] || 'Your puja request could not be submitted.');
      toast.success('Your PanditG On Call request has been submitted.');
      navigate('/requests/' + result.data[0].Id);
    } catch (error) { toast.error(error.message || 'Could not submit your request. Please try again.'); }
    finally { setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-5 text-slate-900 ring-1 ring-amber-200 sm:p-8">
        <button type="button" onClick={() => navigate('/customer/home-services')} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><ApperIcon name="ArrowLeft" size={16} /> Home Services</button>
        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div><div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-amber-800"><ApperIcon name="Flower2" size={15} /> PUJA & CEREMONIES AT HOME</div><h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">PanditG On Call</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">Find a pandit for your family’s puja or ceremony. Share your requirements and review the inclusions and final price before confirming.</p><div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold text-slate-700"><span className="inline-flex items-center gap-1.5"><ApperIcon name="MapPin" size={15} /> Home visit</span><span className="inline-flex items-center gap-1.5"><ApperIcon name="Languages" size={15} /> Language preference</span><span className="inline-flex items-center gap-1.5"><ApperIcon name="ReceiptText" size={15} /> Transparent pricing</span></div></div>
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-amber-200 bg-white text-amber-800 shadow-md sm:size-20"><ApperIcon name="Flower2" size={38}/></div>
        </div>
      </section>
      <form onSubmit={submit} className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card className="space-y-4 p-5 sm:p-6"><div><div className="text-xs font-bold uppercase tracking-wider text-primary">Step 1 of 3</div><h2 className="mt-1 text-xl font-bold">What puja do you need?</h2><p className="mt-1 text-sm text-muted-foreground">Choose an occasion. Select Other Puja for a different ceremony.</p></div><div className="grid gap-3 sm:grid-cols-2">{PUJAS.map((item) => <button type="button" key={item} onClick={() => setPuja(item)} aria-pressed={puja === item} className={'flex min-h-16 items-center gap-3 rounded-xl border p-4 text-left font-semibold transition ' + (puja === item ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/50')}><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800"><ApperIcon name="Flower2" size={19} /></span><span className="flex-1">{item}</span>{puja === item && <ApperIcon name="CheckCircle2" size={18} className="text-primary" />}</button>)}</div></Card>
          <Card className="space-y-4 p-5 sm:p-6"><div><div className="text-xs font-bold uppercase tracking-wider text-primary">Step 2 of 3</div><h2 className="mt-1 text-xl font-bold">Plan your visit</h2><p className="mt-1 text-sm text-muted-foreground">Your preferred time is not confirmed until a provider accepts.</p></div><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="pandit-date" className="text-sm font-medium">Preferred date (optional)</label><Input id="pandit-date" type="date" min={new Date().toLocaleDateString('en-CA')} value={date} onChange={(event) => setDate(event.target.value)} className="mt-1" /></div><div><label htmlFor="pandit-time" className="text-sm font-medium">Preferred time</label><select id="pandit-time" value={time} onChange={(event) => setTime(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="Flexible">Flexible / discuss with pandit</option><option value="07:00">7:00 AM</option><option value="09:00">9:00 AM</option><option value="11:00">11:00 AM</option><option value="13:00">1:00 PM</option><option value="15:00">3:00 PM</option><option value="17:00">5:00 PM</option></select></div><div><label htmlFor="pandit-language" className="text-sm font-medium">Preferred language</label><select id="pandit-language" value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option>Hindi</option><option>Sanskrit</option><option>Awadhi</option><option>English</option><option>Other / discuss</option></select></div><div><label htmlFor="pandit-attendees" className="text-sm font-medium">People attending</label><select id="pandit-attendees" value={attendees} onChange={(event) => setAttendees(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option>1–5 people</option><option>6–15 people</option><option>16–30 people</option><option>More than 30</option></select></div></div><div><label htmlFor="pandit-samagri" className="text-sm font-medium">Puja samagri</label><select id="pandit-samagri" value={samagri} onChange={(event) => setSamagri(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="Please advise">Please advise me</option><option value="Customer will arrange">I will arrange samagri</option><option value="Pandit to arrange">Ask the pandit to arrange samagri</option><option value="Discuss before booking">Discuss before booking</option></select></div><div><label htmlFor="pandit-notes" className="text-sm font-medium">Special requirements (optional)</label><Textarea id="pandit-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Traditions, ceremony details or anything the pandit should know." maxLength={1200} className="mt-1 min-h-24" /></div></Card>
          <Card className="space-y-4 p-5 sm:p-6"><div><div className="text-xs font-bold uppercase tracking-wider text-primary">Step 3 of 3</div><h2 className="mt-1 text-xl font-bold">Where should the pandit visit?</h2><p className="mt-1 text-sm text-muted-foreground">Enter the full address so the provider can assess travel and availability.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={useSavedAddress} disabled={!customer?.location_c}><ApperIcon name="MapPin" size={16} /> Use saved address</Button><Button type="button" variant="outline" onClick={useCurrentLocation}><ApperIcon name="LocateFixed" size={16} /> Use current location</Button></div><div><label htmlFor="pandit-address" className="text-sm font-medium">Full address and locality *</label><Textarea id="pandit-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="House/flat, street, locality, city and nearby landmark" maxLength={500} required className="mt-1 min-h-24" /></div>{coords && <p className="text-xs text-muted-foreground">Location pin captured: {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}</p>}</Card>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24"><Card className="space-y-4 p-5"><h2 className="text-lg font-bold">Your request</h2><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-800"><ApperIcon name="Flower2" size={21}/></span><div><div className="font-semibold">PanditG On Call</div><div className="mt-1 text-sm text-muted-foreground">{puja}</div></div></div><div className="space-y-2 border-t border-border pt-3 text-sm"><div className="flex justify-between gap-3"><span className="text-muted-foreground">Date</span><span className="text-right font-medium">{date || 'To be discussed'}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Time</span><span className="text-right font-medium">{time === 'Flexible' ? 'Flexible' : time}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Language</span><span className="text-right font-medium">{language}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Samagri</span><span className="text-right font-medium">{samagri}</span></div></div><div className="rounded-xl bg-muted/60 p-3"><div className="flex items-start gap-2"><ApperIcon name="ShieldCheck" size={17} className="mt-0.5 text-primary" /><p className="text-xs leading-5 text-muted-foreground">No price is assumed. Review ceremony inclusions and any travel charge before accepting the final quote.</p></div></div><Button type="submit" size="lg" className="w-full" disabled={busy || !address.trim() || !customer?.Id || !category?.Id}>{busy ? <><ApperIcon name="LoaderCircle" size={17} className="animate-spin" /> Submitting…</> : <><ApperIcon name="Send" size={17} /> Find a Pandit</>}</Button><p className="text-center text-xs text-muted-foreground">You review the quote before committing.</p></Card><div className="rounded-xl border border-border p-4 text-sm"><div className="flex items-center gap-2 font-semibold"><ApperIcon name="CheckCircle2" size={17} className="text-primary" /> Clear pricing</div><p className="mt-1 text-muted-foreground">Puja, samagri and travel costs are shown separately before you accept the final quote.</p></div></aside>
      </form>
    </div>
  );
}