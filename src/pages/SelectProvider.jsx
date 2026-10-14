import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';

export const route = {
  path: '/emergency/select-provider',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

const { eq } = window.ApperSDK.CoreSDK;

export default function SelectProvider() {
  const navigate = useNavigate();
  const user = useSelector((state) => state.user.user);
  const [searchParams] = useSearchParams();
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState(null);

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await sdk.table('technician_profiles_c')
          .select(['Id', 'Name', 'email_c', 'primary_service_c', 'availability_c', 'service_area_c'])
          .where(eq('status_c', 'Active'))
          .orderByDesc('CreatedOn')
          .page(1, 20)
          .fetch();
        if (!res.success) throw new Error(res.message);
        setProviders(res.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProviders();
  }, []);

  const handleConfirm = async () => {
    if (!selectedProvider) return;
    const emergencyType = searchParams.get('emergencyType');
    const serviceMode = searchParams.get('serviceMode') || 'Urgent';
    const location = searchParams.get('location') || 'Current Location';
    try {
      const res = await sdk.table('emergency_requests_c').create({
        Name: emergencyType,
        customer_c: searchParams.get('customerId'),
        service_mode_c: serviceMode,
        emergency_type_c: emergencyType,
        location_c: location,
        latitude_c: parseFloat(searchParams.get('latitude') || 25.45),
        longitude_c: parseFloat(searchParams.get('longitude') || 81.83),
        emergency_status_c: 'Assigned',
        assigned_technician_c: selectedProvider.Id,
        agreed_price_c: searchParams.get('price') || 500,
      });
      if (!res.success) throw new Error(res.message);
      navigate('/emergency-help');
    } catch (err) {
      alert('Error creating emergency request: ' + err.message);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading providers...</div>;
  if (error) return <div className="p-8 text-center text-red-600">Error: {error}</div>;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold">Select a Service Provider</h1>
      <div className="grid gap-4">
        {providers.map((provider) => (
          <Card key={provider.Id} className={`p-4 cursor-pointer border-2 transition-all ${selectedProvider?.Id === provider.Id ? 'border-primary bg-primary/5' : 'border-border'}`} onClick={() => setSelectedProvider(provider)}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold">{provider.Name}</div>
                <div className="text-sm text-muted-foreground">{provider.service_area_c}</div>
                <Badge className="mt-2">{provider.availability_c}</Badge>
              </div>
              <div className="text-right">
                <div className="font-bold">ETA: 10 mins</div>
                <div className="text-sm text-muted-foreground">Distance: 2.5 km</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {selectedProvider && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="w-full" size="lg">Confirm {selectedProvider.Name}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Service Provider?</AlertDialogTitle>
              <AlertDialogDescription>
                You are about to request {selectedProvider.Name} for your {searchParams.get('emergencyType')} emergency. They will be notified immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirm}>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}