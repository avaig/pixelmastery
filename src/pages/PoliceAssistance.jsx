import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useState } from 'react';
import { sdk } from '@/services/sdk';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { PageHeader } from '@/components/local/EntityPages';
import { toast } from 'sonner';

export const route = {
  path: '/police-assistance',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

export default function PoliceAssistance() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSelector((state) => state.user.user);
  const [creating, setCreating] = useState(false);
  const latitude = parseFloat(location.state?.latitude ?? 25.45);
  const longitude = parseFloat(location.state?.longitude ?? 81.83);
  const location_name = location.state?.location ?? 'Current Location';

  const handleCreatePoliceRequest = async () => {
    try {
      setCreating(true);
      const profileRes = await sdk.table('customer_profiles_c').select(['Id']).fetch();
      if (!profileRes.success) throw new Error('Could not load customer profile');
      const customer = profileRes.data?.[0];
      if (!customer) throw new Error('Customer profile not found');

      const res = await sdk.table('emergency_requests_c').create({
        Name: 'Police Assistance',
        customer_c: customer.Id,
        service_mode_c: 'Emergency',
        emergency_type_c: 'Police Assistance',
        injury_status_c: 'Unknown',
        location_c: location_name,
        latitude_c: latitude,
        longitude_c: longitude,
        distance_c: 0,
        estimated_eta_c: 'TBD',
        emergency_status_c: 'Open',
      });

      if (res.messages.length) {
        toast.error(res.messages[0], { description: res.messages.slice(1).join('\n') || undefined, duration: 8000 });
        console.error(`emergency_requests_c create failed: ${res.messages.join('; ')}`);
        setCreating(false);
        return;
      }
      if (!res.data.length) {
        setCreating(false);
        return;
      }

      toast.success('Police Assistance Request Created', { description: 'Status: Awaiting authorized police integration' });
      setTimeout(() => navigate('/emergency-help'), 1000);
    } catch (error) {
      toast.error('Error creating police request: ' + error.message);
      console.error(`Error creating police assistance: ${error.message}`);
      setCreating(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Police Assistance" title="Request Police Help" description="Use this to request police assistance for your situation." />
      <Card className="mx-auto max-w-2xl p-8">
        <div className="space-y-6">
          <div className="rounded-lg bg-muted p-6">
            <div className="flex gap-4">
              <ApperIcon name="AlertTriangle" size={24} className="mt-1 text-destructive" />
              <div>
                <h3 className="font-heading text-lg font-semibold">Important Notice</h3>
                <p className="mt-2 text-sm text-muted-foreground">This is a demo interface. Police Assistance requests are created locally for demonstration purposes only.</p>
                <p className="mt-2 text-sm text-muted-foreground"><strong>Status:</strong> Awaiting authorized police integration</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="font-heading text-base font-semibold">Request Details</h3>
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Location:</span> {location_name}</div>
              <div><span className="text-muted-foreground">Type:</span> Police Assistance</div>
              <div><span className="text-muted-foreground">Latitude:</span> {latitude.toFixed(4)}</div>
              <div><span className="text-muted-foreground">Longitude:</span> {longitude.toFixed(4)}</div>
            </div>
          </div>
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <h3 className="font-heading text-sm font-semibold">What Happens Next</h3>
            <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
              <li>Your request is created and timestamped</li>
              <li>Mock demo status shows: "Police Assistance Request Created"</li>
              <li>When police integration is available, your request will be dispatched to authorities</li>
              <li>You will receive updates on the status in the Emergency Help section</li>
            </ol>
          </div>
          <div className="flex gap-3">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={creating}>
                  <ApperIcon name="AlertTriangle" size={17} /> Confirm Police Assistance
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Request Police Assistance?</AlertDialogTitle>
                  <AlertDialogDescription>This will create a police assistance request for your location. Once authorized integration is live, this will be forwarded to authorities.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCreatePoliceRequest} disabled={creating}>{creating ? 'Creating...' : 'Confirm'}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" onClick={() => navigate('/emergency-help')} disabled={creating}>Go back</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}