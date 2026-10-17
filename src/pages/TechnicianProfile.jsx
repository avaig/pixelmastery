import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import { PageHeader } from '@/components/local/EntityPages';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { getCapabilityCatalog } from '@/services/capabilityCatalog';
import FilePicker from '@/components/FilePicker';

const { eq } = window.ApperSDK.CoreSDK;

export const route = {
  path: '/service-provider/profile',
  layout: 'owner',
  access: "profile === 'ServiceProvider_c'",
};

export const nav = {
  to: '/service-provider/profile',
  label: 'Provider onboarding',
  icon: 'ClipboardCheck',
  order: 8,
  profiles: ['ServiceProvider_c'],
  section: 'Account',
};

const initialForm = {
  Name: '',
  email_c: '',
  phone_c: '',
  provider_type_c: 'Individual',
  preferred_language_c: 'Hindi',
  current_address_c: '',
  emergency_contact_c: '',
  business_name_c: '',
  business_address_c: '',
  experience_c: '',
  service_area_c: '',
  latitude_c: null,
  longitude_c: null,
  service_radius_km_c: 10,
  availability_c: 'Available Now',
  primary_service_c: '',
  secondary_service_c: '',
  identity_document_type_c: 'Other accepted ID',
  identity_document_status_c: 'Not submitted',
  pan_status_c: 'Not applicable',
  bank_status_c: 'Not submitted',
  driving_licence_status_c: 'Not applicable',
  vehicle_documents_status_c: 'Not applicable',
  business_document_status_c: 'Not applicable',
  background_check_status_c: 'Not started',
  training_status_c: 'Not started',
  pricing_method_c: 'Provider quote',
  terms_accepted_c: false,
  verification_status_c: 'Draft',
  review_notes_c: '',
  profile_photo_c: '',
};

function Field({ label, id, required, children, hint }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}{required ? ' *' : ''}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StatusPanel({ status, notes }) {
  const approved = status === 'Approved';
  const corrections = status === 'Corrections requested';
  return (
    <div className={`rounded-lg border p-4 ${approved ? 'border-success bg-success/5' : corrections ? 'border-warning bg-warning/5' : 'border-border bg-muted/30'}`}>
      <div className="flex items-center gap-2 font-medium">
        <ApperIcon name={approved ? 'BadgeCheck' : corrections ? 'FileWarning' : 'ClipboardCheck'} size={18} />
        {status || 'Draft'}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {approved ? 'Your profile is approved. Only approved services may receive bookings.' : corrections ? 'Please review the note from LOCAL and update the relevant details.' : 'Complete your details and submit them for Admin Review before receiving bookings.'}
      </p>
      {notes && <p className="mt-2 text-sm">LOCAL note: {notes}</p>}
    </div>
  );
}

export default function ServiceProviderProfile() {
  const user = useSelector((state) => state.user.user);
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [selectedCapabilities, setSelectedCapabilities] = useState([]);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [documents, setDocuments] = useState({});
  const [profilePhotoFiles, setProfilePhotoFiles] = useState([]);
  const [capabilityExperience, setCapabilityExperience] = useState({});
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const { data: technician, loading, run: reloadTechnician } = useFetch(
    () => sdk.table('technician_profiles_c')
      .select(['Id', 'Name', 'email_c', 'phone_c', 'provider_type_c', 'preferred_language_c', 'current_address_c', 'emergency_contact_c', 'business_name_c', 'business_address_c', 'experience_c', 'primary_service_c', 'secondary_service_c', 'availability_c', 'service_area_c', 'latitude_c', 'longitude_c', 'service_radius_km_c', 'identity_document_type_c', 'identity_document_status_c', 'pan_status_c', 'bank_status_c', 'driving_licence_status_c', 'vehicle_documents_status_c', 'business_document_status_c', 'background_check_status_c', 'training_status_c', 'pricing_method_c', 'terms_accepted_c', 'verification_status_c', 'review_notes_c', 'profile_photo_c', 'status_c'])
      .where(eq('email_c', user?.emailAddress ?? user?.email ?? ''))
      .page(1, 1)
      .fetch()
      .then((res) => {
        const row = res.data?.[0] ?? null;
        const saved = JSON.parse(window.localStorage.getItem('local_demo_provider_onboarding_applications_v1') || '[]');
        const application = Array.isArray(saved) ? saved.find((item) => item.email_c === (user?.emailAddress ?? user?.email ?? '')) : null;
        return row && application ? { ...row, ...application } : row ?? application ?? null;
      }),
    [user?.emailAddress, user?.email],
  );
  const { data: capabilities } = useFetch(
    () => getCapabilityCatalog(),
    [],
  );
  const { data: capabilityLinks, run: reloadCapabilityLinks } = useFetch(
    () => technician?.Id
      ? sdk.table('service_provider_capabilities_c').select(['Id', 'technician_c', 'capability_c', 'status_c']).where(eq('technician_c', technician.Id)).page(1, 100).fetch().then((res) => res.data ?? [])
      : Promise.resolve([]),
    [technician?.Id],
  );

  useEffect(() => {
    if (!technician) {
      setForm((current) => ({ ...current, email_c: user?.emailAddress ?? user?.email ?? '' }));
      return;
    }
    setForm((current) => {
      const next = { ...initialForm };
      Object.keys(next).forEach((key) => {
        if (technician[key] !== undefined && technician[key] !== null) next[key] = technician[key];
      });
      next.primary_service_c = technician.primary_service_c?.Id ?? technician.primary_service_c ?? '';
      next.secondary_service_c = technician.secondary_service_c?.Id ?? technician.secondary_service_c ?? '';
      next.email_c = technician.email_c ?? user?.emailAddress ?? user?.email ?? '';
      next.verification_status_c = technician.verification_status_c ?? (technician.status_c === 'Active' ? 'Approved' : 'Draft');
      next.terms_accepted_c = Boolean(technician.terms_accepted_c);
      try {
        const savedPhoto = JSON.parse(technician.profile_photo_c || '[]');
        setProfilePhotoFiles(Array.isArray(savedPhoto) ? savedPhoto : []);
      } catch {
        setProfilePhotoFiles([]);
      }
      return next;
    });
  }, [technician, user]);

  useEffect(() => {
    if (capabilityLinks?.length) {
      setSelectedCapabilities(capabilityLinks.map((item) => String(item.capability_c?.Id ?? item.capability_c)));
      return;
    }
    const saved = JSON.parse(window.localStorage.getItem('local_demo_provider_onboarding_applications_v1') || '[]');
    const application = Array.isArray(saved) ? saved.find((item) => item.email_c === (user?.emailAddress ?? user?.email ?? '')) : null;
    if (application?._demoCapabilityIds) setSelectedCapabilities(application._demoCapabilityIds.map(String));
  }, [capabilityLinks, user?.emailAddress, user?.email]);

  const requiresVehicle = useMemo(() => (capabilities ?? []).some((item) => selectedCapabilities.includes(String(item.Id)) && /driver|towing|fuel|roadside|jump|tyre|tyre|bike|car assistance/i.test(item.Name ?? '')), [capabilities, selectedCapabilities]);
  const isBusiness = form.provider_type_c === 'Business';
  const alreadyApproved = form.verification_status_c === 'Approved' || technician?.status_c === 'Active';

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function captureProviderLocation() {
    if (!navigator.geolocation) {
      toast.error('This browser does not support location. Enter your address and try another device/browser with GPS enabled.');
      return;
    }
    toast.info('Requesting your device location…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        update('latitude_c', Number(position.coords.latitude));
        update('longitude_c', Number(position.coords.longitude));
        toast.success('Provider location captured. Save your profile to keep it.');
      },
      () => toast.error('Location permission was not granted. Enable location access in your browser or device settings.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  async function saveProviderLocation() {
    if (!technician?.Id) {
      toast.error('Save your provider profile first before saving location.');
      return;
    }
    if (form.latitude_c == null || form.longitude_c == null) {
      toast.error('Capture your current location first.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        Id: technician.Id,
        latitude_c: Number(form.latitude_c),
        longitude_c: Number(form.longitude_c),
        service_radius_km_c: Math.max(1, Math.min(100, Number(form.service_radius_km_c) || 10)),
      };
      const result = await sdk.table('technician_profiles_c').update(payload);
      if (!result.success || !result.data?.length) throw new Error(result.messages?.[0] ?? 'Location could not be saved.');
      const key = 'local_demo_provider_onboarding_applications_v1';
      const saved = JSON.parse(window.localStorage.getItem(key) || '[]');
      if (Array.isArray(saved)) {
        const updated = saved.map((item) => String(item.Id) === String(technician.Id) ? { ...item, ...payload } : item);
        window.localStorage.setItem(key, JSON.stringify(updated));
      }
      await reloadTechnician();
      toast.success('Provider location and service radius saved.');
    } catch (error) {
      toast.error(error.message || 'Could not save provider location.');
    } finally {
      setSaving(false);
    }
  }

  function toggleCapability(id) {
    setSelectedCapabilities((current) => current.includes(String(id))
      ? current.filter((value) => value !== String(id))
      : [...current, String(id)]);
  }

  async function startProfileCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Camera-only capture is not supported in this browser. Open LOCAL on a device/browser with camera access over HTTPS.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      cameraStreamRef.current = stream;
      setCameraActive(true);
    } catch (error) {
      toast.error(error.name === 'NotAllowedError' ? 'Allow camera permission to take your profile photograph.' : 'Could not open the camera. Check that your camera is available and not being used by another app.');
    }
  }

  function stopProfileCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraActive(false);
  }

  useEffect(() => {
    if (cameraActive && videoRef.current && cameraStreamRef.current) {
      videoRef.current.srcObject = cameraStreamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);

  useEffect(() => () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function captureProfilePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      toast.error('Camera is still starting. Please wait and try again.');
      return;
    }
    setCameraBusy(true);
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1200 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Camera image could not be prepared.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Camera image could not be captured.')), 'image/jpeg', 0.82));
      const file = new File([blob], `LOCAL-provider-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const uploaded = await sdk.storage.upload(file);
      const previewDataUrl = canvas.toDataURL('image/jpeg', 0.72);
      setProfilePhotoFiles([{ ...uploaded, name: uploaded.name || file.name, type: uploaded.type || file.type, size: uploaded.size || file.size, previewDataUrl }]);
      stopProfileCamera();
      toast.success('Camera photograph captured. Retake it if needed before submission.');
    } catch (error) {
      toast.error(error.message || 'Could not save the camera photograph. Please try again.');
    } finally {
      setCameraBusy(false);
    }
  }

  function chooseDocument(key, file) {
    setDocuments((current) => ({ ...current, [key]: file ? file.name : '' }));
    if (file) toast.info('File selected for this demo. Files are not uploaded while LOCAL uses demo data.');
  }

  function validateStep(currentStep) {
    if (currentStep === 0 && (!form.Name.trim() || !form.phone_c.trim() || !form.current_address_c.trim() || !form.service_area_c.trim())) {
      toast.error('Complete your name, mobile number, current address and service area.');
      return false;
    }
    if (currentStep === 0 && isBusiness && !form.business_name_c.trim()) {
      toast.error('Enter the business or shop name.');
      return false;
    }
    if (currentStep === 0 && profilePhotoFiles.length === 0) {
      toast.error('Take your profile photograph using the live camera before continuing. Gallery uploads are not accepted.');
      return false;
    }
    if (currentStep === 0 && selectedCapabilities.length === 0) {
      toast.error('Select at least one service capability.');
      return false;
    }
    if (currentStep === 0) {
      const missingExperience = selectedCapabilities.some((id) => (capabilityExperience[id] ?? '').trim().length < 5);
      if (missingExperience) {
        toast.error('Add your relevant experience for every selected capability (at least a short description).');
        return false;
      }
    }
    if (currentStep === 1 && !form.terms_accepted_c) {
      toast.error('Please accept the LOCAL terms and privacy notice to submit.');
      return false;
    }
    return true;
  }

  async function save(event) {
    event.preventDefault();
    if (!validateStep(step)) return;
    if (step < 1) {
      setStep((current) => current + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        Name: form.Name.trim(),
        email_c: form.email_c.trim(),
        phone_c: form.phone_c.trim(),
        provider_type_c: form.provider_type_c,
        preferred_language_c: form.preferred_language_c,
        current_address_c: form.current_address_c.trim(),
        emergency_contact_c: form.emergency_contact_c.trim(),
        business_name_c: isBusiness ? form.business_name_c.trim() : '',
        business_address_c: isBusiness ? form.business_address_c.trim() : '',
        experience_c: [
          form.experience_c.trim() ? `General experience: ${form.experience_c.trim()}` : '',
          'Capability-specific experience:',
          ...(capabilities ?? []).filter((item) => selectedCapabilities.includes(String(item.Id))).map((item) => `${item.Name}: ${(capabilityExperience[String(item.Id)] ?? '').trim()}`),
        ].filter(Boolean).join('\n'),
        availability_c: form.availability_c,
        service_area_c: form.service_area_c.trim(),
        latitude_c: Number.isFinite(Number(form.latitude_c)) && form.latitude_c !== null && form.latitude_c !== '' ? Number(form.latitude_c) : null,
        longitude_c: Number.isFinite(Number(form.longitude_c)) && form.longitude_c !== null && form.longitude_c !== '' ? Number(form.longitude_c) : null,
        service_radius_km_c: Math.max(1, Math.min(100, Number(form.service_radius_km_c) || 10)),
        identity_document_type_c: form.identity_document_type_c,
        pricing_method_c: form.pricing_method_c,
        terms_accepted_c: Boolean(form.terms_accepted_c),
        profile_photo_c: JSON.stringify(profilePhotoFiles.map((file) => ({
          Id: file.Id,
          Name: file.Name ?? file.name ?? 'Provider selfie',
          Type: file.Type ?? file.type ?? 'image/jpeg',
          Size: file.Size ?? file.size ?? 0,
          url: file.url ?? file.Url ?? file.previewUrl ?? file.preview_url ?? null,
          previewDataUrl: file.previewDataUrl ?? file.preview_data_url ?? null,
        }))),
      };
      const res = technician
        ? await sdk.table('technician_profiles_c').update({ Id: technician.Id, ...payload })
        : await sdk.table('technician_profiles_c').create(payload);
      if (!res.data?.length) {
        toast.error(res.messages?.[0] ?? 'Your onboarding details could not be saved.');
        return;
      }
      const providerId = technician?.Id ?? res.data[0].Id;
      // Save selected capabilities as pending assignments; Admin approval is still required before matching.
      const linksResult = await sdk.table('service_provider_capabilities_c')
        .select(['Id', 'technician_c', 'capability_c', 'status_c'])
        .page(1, 1000)
        .fetch();
      if (!linksResult.success) throw new Error(linksResult.message || 'Could not load existing service assignments.');
      const providerLinks = (linksResult.data ?? []).filter((link) => String(link.technician_c?.Id ?? link.technician_c_id ?? link.technician_c ?? '') === String(providerId));
      const selectedIds = new Set(selectedCapabilities.map(String));
      // Onboarding resubmission must not silently remove existing approved capabilities.
      // Providers manage later additions/removals in My Services, where changes are tracked separately.
      for (const capabilityId of selectedIds) {
        const alreadyLinked = providerLinks.some((link) => String(link.capability_c?.Id ?? link.capability_c_id ?? link.capability_c ?? '') === capabilityId);
        if (!alreadyLinked) {
          const assigned = await sdk.table('service_provider_capabilities_c').create({
            Name: 'Provider capability',
            technician_c: providerId,
            capability_c: capabilityId,
            status_c: 'Pending',
          });
          if (!assigned.data?.length) throw new Error(assigned.messages?.[0] || 'Could not save selected service capabilities.');
        }
      }
      // MemoryAdapter is re-seeded when the app reloads or a different demo account signs in.
      // Keep a demo-only application snapshot in localStorage so Admin can review it in this browser.
      const demoApplication = {
        ...payload,
        Id: providerId,
        email_c: form.email_c.trim(),
        identity_document_status_c: form.identity_document_status_c,
        pan_status_c: form.pan_status_c,
        bank_status_c: form.bank_status_c,
        driving_licence_status_c: requiresVehicle ? form.driving_licence_status_c : 'Not applicable',
        vehicle_documents_status_c: requiresVehicle ? form.vehicle_documents_status_c : 'Not applicable',
        business_document_status_c: isBusiness ? form.business_document_status_c : 'Not applicable',
        background_check_status_c: form.background_check_status_c,
        training_status_c: form.training_status_c,
        verification_status_c: 'Submitted',
        review_notes_c: '',
        status_c: 'Pending',
        _demoCapabilityIds: selectedCapabilities,
        _demoServiceStatuses: {},
        _demoSubmittedAt: new Date().toISOString(),
      };
      const storageKey = 'local_demo_provider_onboarding_applications_v1';
      const existing = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
      const priorApplication = Array.isArray(existing) ? existing.find((item) => item.email_c === demoApplication.email_c) : null;
      const nextApplications = Array.isArray(existing) ? existing.filter((item) => item.email_c !== demoApplication.email_c) : [];
      if (priorApplication?._demoServiceStatuses) {
        demoApplication._demoServiceStatuses = priorApplication._demoServiceStatuses;
      }
      nextApplications.push(demoApplication);
      window.localStorage.setItem(storageKey, JSON.stringify(nextApplications));
      await reloadTechnician();
      await reloadCapabilityLinks();
      toast.success(form.verification_status_c === 'Corrections requested' ? 'Corrections resubmitted to LOCAL for review.' : 'Onboarding submitted. LOCAL will review your profile before activation.');
      navigate('/service-provider');
    } catch (error) {
      toast.error(error.message || 'Could not submit onboarding.');
    } finally {
      setSaving(false);
    }
  }

  const stepLabels = ['Profile details', 'Verification & consent'];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader eyebrow="Service Provider onboarding" title="Join LOCAL as a service provider" description="Complete your profile once. Only documents relevant to your services are required before activation." />
      <StatusPanel status={form.verification_status_c} notes={form.review_notes_c} />
      {alreadyApproved && <Card className="space-y-3 border-primary/30 p-5"><div><h2 className="font-heading text-lg font-semibold">Location for nearby matching</h2><p className="mt-1 text-sm text-muted-foreground">Keep your work/base location and service radius current so LOCAL can match you to nearby customers. Only capture your location when you are comfortable sharing it for matching.</p></div><Button type="button" variant="outline" onClick={captureProviderLocation}><ApperIcon name="MapPin" size={16} /> Capture current location</Button>{form.latitude_c != null && form.longitude_c != null && <p className="text-sm text-success">Coordinates: {Number(form.latitude_c).toFixed(5)}, {Number(form.longitude_c).toFixed(5)}</p>}<Field label="Service radius (km)" id="provider-radius-approved" hint="Maximum distance you normally accept jobs from your base."><Input id="provider-radius-approved" type="number" min="1" max="100" value={form.service_radius_km_c ?? 10} onChange={(event) => update('service_radius_km_c', event.target.value)} /></Field><Button type="button" onClick={saveProviderLocation} disabled={saving || form.latitude_c == null || form.longitude_c == null}>{saving ? 'Saving location…' : 'Save location settings'}</Button>{(form.latitude_c == null || form.longitude_c == null) && <p className="text-xs text-amber-700">No GPS coordinates saved yet. Distance-based matching cannot be accurate until a location is captured.</p>}</Card>}
      {alreadyApproved ? (
        <Card className="flex items-start gap-3 border-success/40 bg-success/5 p-5">
          <ApperIcon name="BadgeCheck" size={24} className="text-success" />
          <div><h2 className="font-semibold">Provider verification complete</h2><p className="mt-1 text-sm text-muted-foreground">Your profile has been approved by LOCAL. You do not need to submit onboarding again. Use My Services to add or remove services whenever your offerings change.</p></div>
        </Card>
      ) : <>
      <div className="grid grid-cols-2 gap-2">
        {stepLabels.map((label, index) => (
          <button key={label} type="button" onClick={() => index <= step ? setStep(index) : null} className={`min-h-16 rounded-lg border px-3 py-2 text-left text-sm ${step === index ? 'border-primary bg-primary/5' : index < step ? 'border-success/50 bg-success/5' : 'border-border bg-card'}`} aria-current={step === index ? 'step' : undefined}>
            <span className="block text-xs text-muted-foreground">STEP {index + 1}</span>
            <span className="mt-1 block font-medium">{label}</span>
          </button>
        ))}
      </div>
      <Card className="p-5 md:p-7">
        {loading ? <div className="h-72 animate-pulse rounded-lg bg-muted" /> : (
          <form onSubmit={save} className="space-y-6">
            {step === 0 && (
              <section className="space-y-5">
                <div><h2 className="font-heading text-xl font-semibold">Basic profile</h2><p className="mt-1 text-sm text-muted-foreground">Your mobile number is used for contact. OTP verification should be completed through the authentication provider.</p></div>
                <div className="space-y-3 rounded-xl border border-border p-4 md:p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ApperIcon name="Camera" size={20} /></div>
                    <div><h3 className="font-semibold">Live profile photograph *</h3><p className="mt-1 text-sm text-muted-foreground">Capture a fresh selfie using your phone camera or webcam. On supported phones, the camera opens directly. Gallery-selected images are not considered live-verified.</p></div>
                  </div>
                  {cameraActive ? (
                    <div className="space-y-3 rounded-lg border border-border p-3">
                      <video ref={videoRef} autoPlay playsInline muted className="max-h-80 w-full rounded-lg bg-black object-contain" aria-label="Live camera preview" />
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" disabled={cameraBusy} onClick={captureProfilePhoto}>{cameraBusy ? 'Saving photo…' : 'Capture photograph'}</Button>
                        <Button type="button" variant="outline" disabled={cameraBusy} onClick={stopProfileCamera}>Cancel camera</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Button type="button" onClick={startProfileCamera}><ApperIcon name="Camera" size={16} /> {profilePhotoFiles.length ? 'Retake using camera' : 'Open camera and take photograph'}</Button>
                      {profilePhotoFiles.length > 0 && <div className="rounded-lg border border-border p-3"><p className="mb-2 text-sm font-medium">Photograph captured</p><FilePicker value={profilePhotoFiles} readOnly maxFiles={1} fieldConfig={{ supportedExtensions: 'jpg,jpeg,png', supportMultipleValues: false }} /></div>}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">LOCAL opens the live camera and captures the image directly. There is no Gallery upload control for the profile photograph. Camera access requires browser permission and a secure HTTPS connection.</p>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Full name" id="provider-name" required><Input id="provider-name" value={form.Name} onChange={(event) => update('Name', event.target.value)} required placeholder="Your full name" /></Field>
                  <Field label="Login email" id="provider-email"><Input id="provider-email" value={form.email_c} readOnly className="bg-muted/30" /></Field>
                  <Field label="Mobile number" id="provider-phone" required><Input id="provider-phone" type="tel" value={form.phone_c} onChange={(event) => update('phone_c', event.target.value)} required placeholder="+91 98765 43210" /></Field>
                  <Field label="Preferred language" id="provider-language"><Select value={form.preferred_language_c} onValueChange={(value) => update('preferred_language_c', value)}><SelectTrigger id="provider-language"><SelectValue /></SelectTrigger><SelectContent>{['Hindi', 'English', 'Urdu', 'Other'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>
                  <Field label="Current address" id="provider-address" required><Textarea id="provider-address" value={form.current_address_c} onChange={(event) => update('current_address_c', event.target.value)} required placeholder="House / shop, locality, city" /></Field>
                  <Field label="Service area" id="provider-area" required hint="List localities you can realistically reach."><Input id="provider-area" value={form.service_area_c} onChange={(event) => update('service_area_c', event.target.value)} required placeholder="Naini, Civil Lines, Allahpur…" /></Field>
                  <div className="space-y-2 rounded-lg border border-border p-3 md:col-span-2">
                    <div className="font-medium">Provider location for nearby matching</div>
                    <p className="text-sm text-muted-foreground">Capture your current work/base location so LOCAL can calculate distance to customer pickup points. Browser permission is required. This demo stores the coordinates with your profile.</p>
                    <Button type="button" variant="outline" onClick={captureProviderLocation}><ApperIcon name="MapPin" size={16} /> Use current provider location</Button>
                    {form.latitude_c != null && form.longitude_c != null && <p className="text-xs text-success">Location saved in form: {Number(form.latitude_c).toFixed(5)}, {Number(form.longitude_c).toFixed(5)}</p>}
                    <Field label="Service radius (km)" id="provider-radius" hint="Maximum distance you normally accept jobs from your base. Use 10 km as a demo default and adjust to your real coverage."><Input id="provider-radius" type="number" min="1" max="100" value={form.service_radius_km_c ?? 10} onChange={(event) => update('service_radius_km_c', event.target.value)} /></Field>
                    {(form.latitude_c == null || form.longitude_c == null) && <p className="text-xs text-amber-700">Coordinates not captured yet. Address and service area alone cannot provide accurate distance or ETA.</p>}
                  </div>
                  <Field label="Emergency contact" id="provider-emergency"><Input id="provider-emergency" type="tel" value={form.emergency_contact_c} onChange={(event) => update('emergency_contact_c', event.target.value)} placeholder="Name and contact number" /></Field>
                  <Field label="Availability" id="provider-availability"><Select value={form.availability_c} onValueChange={(value) => update('availability_c', value)}><SelectTrigger id="provider-availability"><SelectValue /></SelectTrigger><SelectContent>{['Available Now', 'Today', 'Busy', 'Offline'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>
                </div>
              </section>
            )}
            {step === 0 && (
              <section className="space-y-5">
                <div><h2 className="font-heading text-xl font-semibold">Provider type and work details</h2><p className="mt-1 text-sm text-muted-foreground">Tell us whether you work independently or through a business, your experience and how you price jobs.</p></div>
                <Field label="Provider type" id="provider-type" required><Select value={form.provider_type_c} onValueChange={(value) => update('provider_type_c', value)}><SelectTrigger id="provider-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Individual">Individual</SelectItem><SelectItem value="Business">Business / workshop</SelectItem></SelectContent></Select></Field>
                {isBusiness && <div className="grid gap-5 md:grid-cols-2"><Field label="Business / shop name" id="business-name" required><Input id="business-name" value={form.business_name_c} onChange={(event) => update('business_name_c', event.target.value)} required placeholder="Registered or trading name" /></Field><Field label="Business address" id="business-address"><Input id="business-address" value={form.business_address_c} onChange={(event) => update('business_address_c', event.target.value)} placeholder="Shop address" /></Field></div>}
                <Field label="Experience and qualifications" id="provider-experience" hint="Mention years of experience, relevant certificates or specialties."><Textarea id="provider-experience" value={form.experience_c} onChange={(event) => update('experience_c', event.target.value)} placeholder="e.g. 6 years of car electrical and battery work" /></Field>
                <Field label="How will you price jobs?" id="provider-pricing"><Select value={form.pricing_method_c} onValueChange={(value) => update('pricing_method_c', value)}><SelectTrigger id="provider-pricing"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Fixed rate">Fixed rate for defined services</SelectItem><SelectItem value="Provider quote">Quote after reviewing the job</SelectItem><SelectItem value="Distance/time">Distance- or time-based rate</SelectItem></SelectContent></Select></Field>
                <div className="space-y-3 rounded-lg border border-border p-4">
                  <div>
                    <h3 className="font-semibold">Services you can provide</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Select every service you are qualified and equipped to offer. LOCAL will match requests only to your selected, approved capabilities.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(capabilities ?? []).map((capability) => {
                      const selected = selectedCapabilities.includes(String(capability.Id));
                      return (
                        <label key={capability.Id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}`}>
                          <Checkbox checked={selected} onCheckedChange={() => toggleCapability(capability.Id)} />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">{capability.Name}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">{capability.vehicle_type_c} · {capability.description_c}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {selectedCapabilities.length > 0 && <div className="space-y-3 rounded-lg border border-border p-4">
                    <div><h4 className="font-semibold">Experience for each selected service</h4><p className="mt-1 text-sm text-muted-foreground">Describe the work you have actually done for every capability. Admin will review each service separately.</p></div>
                    {(capabilities ?? []).filter((item) => selectedCapabilities.includes(String(item.Id))).map((capability) => <Field key={capability.Id} label={`${capability.Name} — relevant experience`} id={`experience-${capability.Id}`} required hint="Mention years of experience, typical jobs completed, or relevant training."><Textarea id={`experience-${capability.Id}`} value={capabilityExperience[String(capability.Id)] ?? ''} onChange={(event) => setCapabilityExperience((current) => ({ ...current, [String(capability.Id)]: event.target.value }))} required placeholder={`Describe your experience with ${capability.Name}`} /></Field>)}
                  </div>}
                  <p className="text-xs text-muted-foreground">{selectedCapabilities.length} service(s) selected. Every selected capability is submitted for manual Admin approval; adding a capability later under My Services creates a separate pending review.</p>
                </div>
              </section>
            )}
            {step === 1 && (
              <>
              <section className="space-y-5">
                <div><h2 className="font-heading text-xl font-semibold">Documents and payout readiness</h2><p className="mt-1 text-sm text-muted-foreground">Submit the applicable documents for review. Providers cannot mark their own documents as verified; LOCAL Admin must verify them. Do not enter Aadhaar numbers, bank account numbers, UPI PINs or passwords into text fields.</p></div>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Identity document type" id="identity-type" required><Select value={form.identity_document_type_c} onValueChange={(value) => update('identity_document_type_c', value)}><SelectTrigger id="identity-type"><SelectValue /></SelectTrigger><SelectContent>{['Aadhaar verified securely', 'Voter ID', 'Passport', 'Driving licence', 'Other accepted ID'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>
                  <Field label="Identity document status" id="identity-status" hint="Set by LOCAL after review."><Input id="identity-status" value={form.identity_document_status_c || 'Not submitted'} readOnly className="bg-muted/30" /></Field>
                  <Field label="PAN status" id="pan-status" hint="Conditional: LOCAL Admin records verification when required. Lack of PAN alone does not automatically block every worker."><Input id="pan-status" value={form.pan_status_c || 'Not applicable'} readOnly className="bg-muted/30" /></Field>
                  <Field label="Bank / UPI payout status" id="bank-status" hint="Payout details must be verified before payouts are enabled."><Input id="bank-status" value={form.bank_status_c || 'Not submitted'} readOnly className="bg-muted/30" /></Field>
                  {requiresVehicle && <><Field label="Driving licence status" id="licence-status" hint="Set by LOCAL after checking the applicable licence."><Input id="licence-status" value={form.driving_licence_status_c || 'Not submitted'} readOnly className="bg-muted/30" /></Field><Field label="Vehicle RC / insurance / permits status" id="vehicle-status" hint="Required only for capabilities where the provider's vehicle or activity requires it."><Input id="vehicle-status" value={form.vehicle_documents_status_c || 'Not applicable'} readOnly className="bg-muted/30" /></Field></>}
                  {isBusiness && <Field label="Business licence / authorization status" id="business-doc-status" hint="Set by LOCAL after review, where applicable."><Input id="business-doc-status" value={form.business_document_status_c || 'Not applicable'} readOnly className="bg-muted/30" /></Field>}
                  <Field label="Background verification" id="background-status" hint="Tracked by LOCAL where required."><Input id="background-status" value={form.background_check_status_c || 'Not started'} readOnly className="bg-muted/30" /></Field>
                  <Field label="Safety / service training" id="training-status" hint="LOCAL records completion after checking evidence where required."><Input id="training-status" value={form.training_status_c || 'Not started'} readOnly className="bg-muted/30" /></Field>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-4 md:p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <ApperIcon name="Files" size={20} />
                    </div>
                    <div>
                      <h3 className="font-semibold">Upload supporting documents</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Choose the relevant file below. Accepted formats: PDF, JPG or PNG.</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {[['identity', 'Identity document'], ['pan', 'PAN Card (if applicable)'], ['payout', 'Bank / UPI proof'], ...(requiresVehicle ? [['licence', 'Driving licence'], ['vehicle', 'Vehicle documents']] : []), ...(isBusiness ? [['business', 'Business authorization']] : [])].map(([key, label]) => (
                      <div key={key} className="rounded-xl border border-border bg-card p-4">
                        <Label htmlFor={`doc-${key}`} className="text-sm font-semibold">{label}</Label>
                        <p className="mt-1 text-xs text-muted-foreground">{key === 'identity' ? 'A clear image or scan of your selected ID.' : key === 'pan' ? 'Optional unless applicable to your legal, tax or payout situation. Do not enter the PAN number into a text field.' : key === 'payout' ? 'A document showing your bank or UPI payout details. Never upload passwords, PINs or UPI PINs.' : key === 'licence' ? 'For services that require a driving licence.' : key === 'vehicle' ? 'Relevant vehicle registration, insurance or permits.' : 'Relevant business registration or authorization.'}</p>
                        <input id={`doc-${key}`} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" onChange={(event) => chooseDocument(key, event.target.files?.[0])} />
                        <label htmlFor={`doc-${key}`} className="mt-3 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2">
                          <ApperIcon name="UploadCloud" size={18} />
                          {documents[key] ? 'Replace selected file' : `Upload ${label}`}
                        </label>
                        <div className="mt-3 flex items-start gap-2 rounded-md bg-muted/50 p-2.5">
                          <ApperIcon name={documents[key] ? 'FileCheck' : 'File'} size={17} className="mt-0.5 shrink-0 text-muted-foreground" />
                          <p className="min-w-0 flex-1 break-words text-xs text-muted-foreground">{documents[key] || 'No file selected yet'}</p>
                          {documents[key] && <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => { setDocuments((current) => { const next = { ...current }; delete next[key]; return next; }); const input = document.getElementById(`doc-${key}`); if (input) input.value = ''; }}>Remove</Button>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                    <ApperIcon name="ShieldAlert" size={18} className="mt-0.5 shrink-0 text-amber-700" />
                    <p className="text-muted-foreground"><span className="font-semibold text-foreground">Demo mode:</span> Selecting a file only displays its filename during this session. Files are not uploaded or stored by LOCAL yet. Do not submit sensitive identity or bank documents until secure document storage is enabled.</p>
                  </div>
                </div>
              </section>
              <section className="space-y-5">
                <div><h2 className="font-heading text-xl font-semibold">Review and consent</h2><p className="mt-1 text-sm text-muted-foreground">Confirm the profile is accurate. LOCAL will review the submitted details before activating the selected services.</p></div>
                <div className="grid gap-3 md:grid-cols-2">
                  {[['Provider', form.Name], ['Type', form.provider_type_c], ['Mobile', form.phone_c], ['Service area', form.service_area_c], ['Pricing method', form.pricing_method_c], ['Identity status', form.identity_document_status_c], ['Payout status', form.bank_status_c]].map(([label, value]) => <div key={label} className="rounded-md border border-border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-medium">{value || 'Not provided'}</div></div>)}
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-muted/30 p-4">
                  <Checkbox id="provider-consent" checked={Boolean(form.terms_accepted_c)} onCheckedChange={(checked) => update('terms_accepted_c', checked === true)} />
                  <div><Label htmlFor="provider-consent" className="cursor-pointer">I confirm that the information is accurate and agree to LOCAL’s provider terms, privacy notice, applicable verification checks, customer communication rules and cancellation policy. *</Label><p className="mt-1 text-xs text-muted-foreground">Sensitive documents should be reviewed through a secure process; consent and review decisions must be recorded.</p></div>
                </div>
                <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Commission: 10% on completed eligible service amounts under the proposed launch policy. No zero-commission introductory jobs. The final commission base, payout timing and cancellation/refund rules must be shown in the provider agreement before activation.</div>
              </section>
              </>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <Button type="button" variant="outline" disabled={step === 0 || saving} onClick={() => setStep((current) => Math.max(0, current - 1))}>Back</Button>
              <div className="flex gap-2">
                {step < 1 ? <Button type="submit">Continue <ApperIcon name="ArrowRight" size={16} /></Button> : <Button type="submit" disabled={saving}>{saving ? <><ApperIcon name="LoaderCircle" size={16} className="animate-spin" /> Saving…</> : <><ApperIcon name="Send" size={16} /> Submit for Admin Review</>}</Button>}
              </div>
            </div>
          </form>
        )}
      </Card>
      </>}
    </div>
  );
}
