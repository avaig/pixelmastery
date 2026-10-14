import { Link } from 'react-router-dom';
import { useState } from 'react';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader, StatusBadge } from '@/components/local/EntityPages';

const { eq, contains, and } = window.ApperSDK.CoreSDK;

export const route = {
  path: '/emergency-requests',
  layout: 'owner',
  access: "profile === 'Admin_c'",
};

export const nav = {
  to: '/emergency-requests',
  label: 'Emergency Requests',
  icon: 'AlertTriangle',
  section: 'Admin',
};

export default function EmergencyRequestsList() {
  const [searchTerm, setSearchTerm] = useState('');
  const { data, loading, error, run } = useFetch(async () => {
    const filters = [];
    if (searchTerm) filters.push(contains('Name', searchTerm));
    let q = sdk.table('emergency_requests_c').select([
      'Id',
      'Name',
      'customer_c',
      'location_c',
      'emergency_type_c',
      'service_mode_c',
      'injury_status_c',
      'assigned_technician_c',
      'agreed_price_c',
      'distance_c',
      'estimated_eta_c',
      'emergency_status_c',
    ]).orderByDesc('CreatedOn');
    if (filters.length) q = q.where(and(...filters));
    const res = await q.page(1, 50).fetch();
    if (!res.success) throw new Error(res.message);
    return res.data ?? [];
  }, [searchTerm]);

  const records = data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Admin workspace"
        title="Emergency Requests"
        description="Track urgent and emergency service requests with direct provider assignment and no bidding."
      />
      <Card className="mb-6 p-4">
        <Input
          placeholder="Search emergency type or location..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </Card>
      {loading ? (
        <Card className="h-80 animate-pulse" />
      ) : error ? (
        <Card className="border-l-4 border-destructive p-6">
          <div className="font-medium">Could not load emergency requests.</div>
          <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
          <Button className="mt-4" variant="outline" onClick={run}>
            Retry
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {records.map((req) => (
            <Link
              key={req.Id}
              to={'/emergency-requests/' + req.Id}
              className="block border border-border p-4 hover:bg-accent rounded-lg transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{req.emergency_type_c}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {req.location_c} • {req.distance_c} km • ETA {req.estimated_eta_c}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="rounded bg-muted px-2 py-1">{req.service_mode_c}</span>
                    {req.injury_status_c && (
                      <span className={`rounded px-2 py-1 ${req.injury_status_c === 'Yes' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>
                        {req.injury_status_c === 'Yes' ? 'Injuries' : 'No injuries'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <StatusBadge value={req.emergency_status_c} />
                  {req.agreed_price_c && (
                    <div className="mt-2 font-medium">₹{Number(req.agreed_price_c ?? 0).toLocaleString('en-IN')}</div>
                  )}
                </div>
              </div>
            </Link>
          ))}
          {!records.length && (
            <Card className="p-8 text-center">
              <ApperIcon name="AlertTriangle" size={32} className="mx-auto text-muted-foreground mb-2" />
              <div className="text-sm text-muted-foreground">No emergency requests found.</div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}