import { Link, useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader, StatusBadge } from '@/components/local/EntityPages';
import { formatLocalDate, formatRelativeTime } from '@/utils/date';
import { DATE_FORMATS } from '@/utils/date';

const { eq } = window.ApperSDK.CoreSDK;

export const route = {
  path: '/emergency-requests/:id',
  layout: 'owner',
  access: "profile === 'Admin_c'",
};

export default function EmergencyRequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const { data: request, loading, error, run } = useFetch(async () => {
    const res = await sdk.table('emergency_requests_c').select(['Id', 'Name', 'customer_c', 'emergency_type_c', 'service_mode_c', 'injury_status_c', 'location_c', 'latitude_c', 'longitude_c', 'distance_c', 'estimated_eta_c', 'emergency_status_c', 'assigned_technician_c', 'agreed_price_c', 'notes_c', 'CreatedOn', 'ModifiedOn']).get(id);
    if (!res.data) throw new Error('Emergency request not found');
    return res.data;
  }, [id]);

  const statusStyles = {
    Open: { bg: 'bg-blue/10', border: 'border-blue/20', text: 'text-blue' },
    Assigned: { bg: 'bg-purple/10', border: 'border-purple/20', text: 'text-purple' },
    'In Progress': { bg: 'bg-amber/10', border: 'border-amber/20', text: 'text-amber' },
    Completed: { bg: 'bg-green/10', border: 'border-green/20', text: 'text-green' },
    Cancelled: { bg: 'bg-red/10', border: 'border-red/20', text: 'text-red' },
  };

  const emergencyTypeStyles = {
    Ambulance: { bg: 'bg-red/10', border: 'border-red/20', text: 'text-red' },
    'Police Assistance': { bg: 'bg-blue/10', border: 'border-blue/20', text: 'text-blue' },
    'Car Accident': { bg: 'bg-orange/10', border: 'border-orange/20', text: 'text-orange' },
    'Bike Accident': { bg: 'bg-orange/10', border: 'border-orange/20', text: 'text-orange' },
    'Flat Tyre': { bg: 'bg-yellow/10', border: 'border-yellow/20', text: 'text-yellow' },
    'Battery Dead': { bg: 'bg-gray/10', border: 'border-gray/20', text: 'text-gray' },
    'Out of Fuel': { bg: 'bg-amber/10', border: 'border-amber/20', text: 'text-amber' },
    'Vehicle Breakdown': { bg: 'bg-red/10', border: 'border-red/20', text: 'text-red' },
    Towing: { bg: 'bg-slate/10', border: 'border-slate/20', text: 'text-slate' },
  };

  return (
    <div>
      <PageHeader eyebrow="Emergency Requests" title="Emergency Request Details" description="" action={<Button asChild variant="outline" onClick={() => navigate(-1)}><ApperIcon name="ArrowLeft" size={17} /> Back</Button>} />
      {loading && !request ? <Card className="h-64 animate-pulse" /> : error ? (
        <Card className="border-l-4 border-destructive p-6">
          <div className="font-medium">Could not load this emergency request.</div>
          <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
          <Button className="mt-4" variant="outline" onClick={run}>Retry</Button>
        </Card>
      ) : request ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card className="p-6 space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold mb-3">{request.Name}</h2>
              <div className="flex gap-2 flex-wrap">
                <StatusBadge value={request.emergency_status_c} />
                <Badge className={emergencyTypeStyles[request.emergency_type_c]?.bg + ' ' + emergencyTypeStyles[request.emergency_type_c]?.text}>{request.emergency_type_c}</Badge>
                <Badge variant="outline">{request.service_mode_c}</Badge>
                {request.injury_status_c && <Badge className="bg-destructive/10 text-destructive">{request.injury_status_c === 'Yes' ? '⚠️ Injuries Present' : 'No Injuries'}</Badge>}
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h3 className="font-heading text-lg font-semibold">Location & Distance</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Location</div>
                  <div className="mt-1 text-sm">{request.location_c}</div>
                  {request.latitude_c && request.longitude_c && <div className="mt-1 text-xs text-muted-foreground">{request.latitude_c}, {request.longitude_c}</div>}
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Distance & ETA</div>
                  <div className="mt-1 text-sm">{request.distance_c ? request.distance_c + ' km' : '—'} • {request.estimated_eta_c || '—'}</div>
                </div>
              </div>
            </div>

            {request.customer_c && (
              <div className="border-t pt-4">
                <h3 className="font-heading text-lg font-semibold mb-3">Customer</h3>
                <div className="text-sm">{request.customer_c.Name}</div>
              </div>
            )}

            {request.assigned_technician_c && (
              <div className="border-t pt-4">
                <h3 className="font-heading text-lg font-semibold mb-3">Assigned Service Provider</h3>
                <div className="text-sm font-medium">{request.assigned_technician_c.Name}</div>
                {request.agreed_price_c && <div className="text-sm text-muted-foreground mt-1">₹{Number(request.agreed_price_c).toLocaleString('en-IN')}</div>}
              </div>
            )}

            {request.notes_c && (
              <div className="border-t pt-4">
                <h3 className="font-heading text-lg font-semibold mb-3">Notes</h3>
                <div className="text-sm whitespace-pre-wrap text-muted-foreground">{request.notes_c}</div>
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">Status</div>
              <div className="text-2xl font-heading font-bold">{request.emergency_status_c}</div>
              <div className="text-xs text-muted-foreground mt-2">Created {formatRelativeTime(request.CreatedOn)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">Type</div>
              <div className="font-medium">{request.emergency_type_c}</div>
            </Card>
            {request.agreed_price_c && (
              <Card className="p-4 border-success/20">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">Agreed Price</div>
                <div className="text-2xl font-heading font-bold text-success">₹{Number(request.agreed_price_c).toLocaleString('en-IN')}</div>
              </Card>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}