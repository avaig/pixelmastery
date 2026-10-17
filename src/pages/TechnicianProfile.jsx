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
  const [documents, setDocuments] = useState({ identity: [], pan: [], bank: [], licence: [], vehicle: [], business: [], certificates: [] });
  const [profilePhotoFiles, setProfilePhotoFiles] = useState([]);
  const [capabilityExperience, setCapabilityExperience] = useState({});
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const { data: technician, loading, run: reloadTechnician } = useFetch(
    () => sdk.table('technician_profiles_c')
      .select(['Id', 'Name', 'email_c', 'phone_c', 'provider_type_c', 'preferred_language_c', 'current_address_c', 'emergency_contact_c', 'business_name_c', 'business_address_c', 'experience_c', 'primary_service_c', 'secondary_service_c', 'availability_c', 'service_area_c', 'latitude_c', 'longitude_c', 'service_radius_km_c', 'identity_document_type_c', 'identity_document_status_c', 'pan_status_c', 'bank_status_c', 'driving_licence_status_c', 'vehicle_documents_status_c', 'business_document_status_c', 'background_check_status_c', 'training_status_c', 'pricing_method_c', 'terms_accepted_c', 'verification_status_c', 'review_notes_c', 'profile_photo_c', 'provider_documents_c', 'status_c'])
      .where(eq('email_c', user?.emailAddress ?? user?.email ?? ''))
      .page(1, 1)
      .fetch()
      .then((res) => {
        const row = res.data?.[0] ?? null;
        const saved = JSON.parse(window.localStorage.getItem('local_demo_provider_onboarding_applications_v1') || '[]');
        const application = Array.isArray(saved) ? saved.find((item) => item.email_c === (user?.emailAddress ?? user?.email ?? '')) : null;
        return row && application
          ? { ...application, ...row, _persistedRecord: true }
          : row
            ? { ...row, _persistedRecord: true }
            : application
              ? { ...application, _persistedRecord: false }
              : null;
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
      try {
        const savedDocuments = JSON.parse(technician.provider_documents_c || '{}');
        if (savedDocuments && typeof savedDocuments === 'object') {
          setDocuments((current) => Object.fromEntries(Object.keys(current).map((key) => [key, Array.isArray(savedDocuments[key]) ? savedDocuments[key] : current[key]])));
        }
      } catch {
        // Preserve current document selections if older records have no document metadata.
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

  const selectedCapabilityNames = useMemo(() => (capabilities ?? []).filter((item) => selectedCapabilities.includes(String(item.Id))).map((item) => String(item.Name ?? '')), [capabilities, selectedCapabilities]);
  const requiresVehicle = useMemo(() => selectedCapabilityNames.some((name) => /driver|towing|fuel|roadside|jump|tyre|bike|car assistance|ambulance/i.test(name)), [selectedCapabilityNames]);
  const requiresDrivingDocs = useMemo(() => selectedCapabilityNames.some((name) => /professional driver|driver on demand|towing|ambulance|vehicle recovery/i.test(name)), [selectedCapabilityNames]);
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

  function updateDocumentFiles(key, files) {
    setDocuments((current) => ({ ...current, [key]: Array.isArray(files) ? files : [] }));
  }

  function documentPicker(label, key, hint, required = false, multiple = false) {
    return <div className="space-y-2 rounded-lg border border-border p-3" key={key}>
      <div className="flex flex-wrap items-center gap-2"><Label>{label}{required ? ' *' : ' (if applicable)'}</Label>{required && <span className="text-xs text-destructive">Required for review</span>}</div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <FilePicker value={documents[key] ?? []} onChange={(files) => updateDocumentFiles(key, files)} maxFiles={multiple ? 5 : 1} fieldConfig={{ supportedExtensions: 'pdf,jpg,jpeg,png', supportMultipleValues: multiple, maxValue: 10240 }} />
    </div>;
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
    if (currentStep === 1 && selectedCapabilities.length === 0) {
      toast.error('Select at least one service capability.');
      return false;
    }
    // Experience helps Admin review capability, but should not block workers who are
    // more comfortable demonstrating practical skills than writing descriptions.
    if (currentStep === 2) {
      if (!(documents.identity ?? []).length) {
        toast.error('Upload one identity proof before continuing.');
        return false;
      }
      if (requiresDrivingDocs && (!(documents.licence ?? []).length || !(documents.vehicle ?? []).length)) {
        toast.error('The selected service requires a driving licence and relevant vehicle documents.');
        return false;
      }
    }
    if (currentStep === 3 && !form.terms_accepted_c) {
      toast.error('Please accept the LOCAL terms and privacy notice to submit.');
      return false;
    }
    return true;
  }

  async function save(event) {
    event.preventDefault();
    if (!validateStep(step)) return;
    if (step < 3) {
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
        service_area_c: form.service_area_c.trim(),
        latitude_c: Number.isFinite(Number(form.latitude_c)) && form.latitude_c !== null && form.latitude_c !== '' ? Number(form.latitude_c) : null,
        longitude_c: Number.isFinite(Number(form.longitude_c)) && form.longitude_c !== null && form.longitude_c !== '' ? Number(form.longitude_c) : null,
        service_radius_km_c: Math.max(1, Math.min(100, Number(form.service_radius_km_c) || 10)),
        identity_document_type_c: form.identity_document_type_c,
        // Verification/status fields are Admin-controlled and intentionally omitted from provider writes.
        // Document filenames and storage references are saved in provider_documents_c for Admin review.
        pricing_method_c: form.pricing_method_c,
        terms_accepted_c: Boolean(form.terms_accepted_c),
        profile_photo_c: JSON.stringify(profilePhotoFiles.map((file) => ({
          Id: file.Id,
          Name: file.Name ?? file.name ?? 'Provider selfie',
          Type: file.Type ?? file.type ?? 'image/jpeg',
          Size: file.Size ?? file.size ?? 0,
          url: file.url ?? file.Url ?? file.previewUrl ?? file.preview_url ?? null,
        }))),
        provider_documents_c: JSON.stringify(Object.fromEntries(Object.entries(documents).map(([key, files]) => [key, (files ?? []).map((file) => ({
          Id: file.Id,
          Name: file.Name ?? file.name ?? 'Uploaded document',
          Type: file.Type ?? file.type ?? 'application/octet-stream',
          Size: file.Size ?? file.size ?? 0,
          url: file.url ?? file.Url ?? file.previewUrl ?? file.preview_url ?? null,
        }))]))),
      };
      // A browser-local demo application is not proof that a database row exists.
      // Updating its stale Id produces "record not found"; create the database row instead.
      const hasPersistedRecord = technician?._persistedRecord === true;
      const res = hasPersistedRecord
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
        provider_documents_c: payload.provider_documents_c,
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

  const stepLabels = ['Basic profile', 'Services & experience', 'Documents & payouts', 'Review & submit'];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader eyebrow="Service Provider onboarding" title="Join LOCAL as a service provider" description="Complete your profile once. Manage your availability and moving location from the dashboard whenever you start or move during the day." />
      <StatusPanel status={form.verification_status_c} notes={form.review_notes_c} />
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
                  <Field label="Emergency contact" id="provider-emergency"><Input id="provider-emergency" type="tel" value={form.emergency_contact_c} onChange={(event) => update('emergency_contact_c', event.target.value)} placeholder="Name and contact number" /></Field>
                </div>
              </section>
            )}
            {step === 1 && (
              <section className="space-y-5">
                <div><h2 className="font-heading text-xl font-semibold">Select your services</h2><p className="mt-1 text-sm text-muted-foreground">Choose the work you can do. LOCAL will review your selected services before you receive jobs.</p></div>
                <Field label="Provider type" id="provider-type" required><Select value={form.provider_type_c} onValueChange={(value) => update('provider_type_c', value)}><SelectTrigger id="provider-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Individual">Individual</SelectItem><SelectItem value="Business">Business / workshop</SelectItem></SelectContent></Select></Field>
                {isBusiness && <div className="grid gap-5 md:grid-cols-2"><Field label="Business / shop name" id="business-name" required><Input id="business-name" value={form.business_name_c} onChange={(event) => update('business_name_c', event.target.value)} required placeholder="Registered or trading name" /></Field><Field label="Business address" id="business-address"><Input id="business-address" value={form.business_address_c} onChange={(event) => update('business_address_c', event.target.value)} placeholder="Shop address" /></Field></div>}
                <Field label="Experience and qualifications" id="provider-experience" hint="Mention years of experience, relevant certificates or specialties."><Textarea id="provider-experience" value={form.experience_c} onChange={(event) => update('experience_c', event.target.value)} placeholder="e.g. 6 years of car electrical and battery work" /></Field>
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
                    <div><h4 className="font-semibold">Optional experience details</h4><p className="mt-1 text-sm text-muted-foreground">You may add details, but this is not required. LOCAL Admin will review each selected service.</p></div>
                    {(capabilities ?? []).filter((item) => selectedCapabilities.includes(String(item.Id))).map((capability) => <Field key={capability.Id} label={`${capability.Name} — experience (optional)`} id={`experience-${capability.Id}`} hint="You can briefly describe jobs you have done, or leave this blank."><Textarea id={`experience-${capability.Id}`} value={capabilityExperience[String(capability.Id)] ?? ''} onChange={(event) => setCapabilityExperience((current) => ({ ...current, [String(capability.Id)]: event.target.value }))} placeholder={`Optional: work you have done for ${capability.Name}`} /></Field>)}
                  </div>}
                  <p className="text-xs text-muted-foreground">{selectedCapabilities.length} service(s) selected. Every selected capability is submitted for manual Admin approval; adding a capability later under My Services creates a separate pending review.</p>
                </div>
              </section>
            )}
            {step === 2 && (
              <section className="space-y-5">
                <div><h2 className="font-heading text-xl font-semibold">Documents & payout verification</h2><p className="mt-1 text-sm text-muted-foreground">Upload clear, readable files. Requirements depend on your selected services and provider type. Documents are submitted for Admin review; they do not automatically approve a provider.</p></div>
                <Field label="Identity document type" id="identity-document-type" required><Select value={form.identity_document_type_c} onValueChange={(value) => update('identity_document_type_c', value)}><SelectTrigger id="identity-document-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Aadhaar verified securely">Aadhaar (secure verification)</SelectItem><SelectItem value="Voter ID">Voter ID</SelectItem><SelectItem value="Passport">Passport</SelectItem><SelectItem value="Driving licence">Driving Licence</SelectItem><SelectItem value="Other accepted ID">Other accepted ID</SelectItem></SelectContent></Select></Field>
                {documentPicker('Identity proof', 'identity', 'Upload an accepted identity document. Use only the information needed for verification.', true)}
                {documentPicker('PAN card', 'pan', 'Upload if you have a PAN or if LOCAL requests it for your provider/business or tax setup.')}
                {documentPicker('Bank-account proof for payouts', 'bank', 'You can complete onboarding first. Add a cancelled cheque, passbook first page or bank statement before your first payout.')}
                {requiresDrivingDocs && <>{documentPicker('Driving licence', 'licence', 'Required for selected driving, towing, or ambulance-related capabilities.', true)}{documentPicker('Vehicle documents', 'vehicle', 'Upload applicable RC, insurance, permit, or fitness documents for the vehicle used to deliver this service.', true, true)}</>}
                {isBusiness && documentPicker('Business proof', 'business', 'Upload business registration, shop licence, or other applicable proof for a business/workshop.')}
                {documentPicker('Service certificates or qualifications', 'certificates', 'Upload relevant certificates, training proof, or licences where your selected service requires them.', false, true)}
                <p className="text-xs text-muted-foreground">Accepted formats: PDF, JPG, JPEG and PNG. Identity proof is required for review. Add payout details before your first payout; PAN and service-specific documents are conditional.</p>
              </section>
            )}
            {step === 3 && (
              <section className="space-y-5">
                <div>
                  <h2 className="font-heading text-xl font-semibold">Review and submit</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Check your details, selected services, and uploaded documents before sending your application to LOCAL Admin.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Provider', form.Name],
                    ['Provider type', form.provider_type_c],
                    ['Mobile', form.phone_c],
                    ['Service area', form.service_area_c],
                    ['Selected services', `${selectedCapabilities.length} service(s)`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border p-3">
                      <div className="text-xs text-muted-foreground">{label}</div>
                      <div className="mt-1 font-medium">{value || 'Not provided'}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-border p-4">
                  <h3 className="font-semibold">Uploaded documents</h3>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {[
                      ['Identity proof', 'identity'], ['PAN card', 'pan'], ['Bank-account proof', 'bank'],
                      ['Driving licence', 'licence'], ['Vehicle documents', 'vehicle'], ['Business proof', 'business'], ['Service certificates', 'certificates'],
                    ].filter(([, key]) => (documents[key] ?? []).length > 0).map(([label, key]) => <li key={key}>{label}: {(documents[key] ?? []).map((file) => file.Name ?? file.name).join(', ')}</li>)}
                    {!Object.values(documents).some((files) => (files ?? []).length > 0) && <li>No documents uploaded yet.</li>}
                  </ul>
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-start gap-3">
                    <ApperIcon name="ShieldCheck" size={21} className="mt-0.5 shrink-0 text-primary" />
                    <div>
                      <h3 className="font-semibold">Verification is handled by LOCAL</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Your uploaded identity and payout documents will be reviewed by LOCAL Admin. PAN and service-specific documents are conditional; approval of each service remains separate.</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 rounded-lg bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox id="provider-consent" checked={Boolean(form.terms_accepted_c)} onCheckedChange={(checked) => update('terms_accepted_c', checked === true)} />
                    <div>
                      <Label htmlFor="provider-consent" className="cursor-pointer">I confirm that the information is accurate and agree to LOCAL’s provider terms, privacy notice, applicable verification checks, customer communication rules and cancellation policy. *</Label>
                      <p className="mt-1 text-xs text-muted-foreground">Only submit information you can verify. Approval is required before receiving eligible bookings.</p>
                    </div>
                  </div>
                </div>
              </section>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <Button type="button" variant="outline" disabled={step === 0 || saving} onClick={() => setStep((current) => Math.max(0, current - 1))}>Back</Button>
              <div className="flex gap-2">
                {step < 3 ? <Button type="submit">Continue <ApperIcon name="ArrowRight" size={16} /></Button> : <Button type="submit" disabled={saving}>{saving ? <><ApperIcon name="LoaderCircle" size={16} className="animate-spin" /> Saving…</> : <><ApperIcon name="Send" size={16} /> Submit for Admin Review</>}</Button>}
              </div>
            </div>
          </form>
        )}
      </Card>
      </>}
    </div>
  );
}
