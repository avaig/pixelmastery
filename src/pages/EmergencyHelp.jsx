import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/local/EntityPages';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const { eq } = window.ApperSDK.CoreSDK;

export const route = {
  path: '/emergency-help',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

const EMERGENCY_OPTIONS = {
  Ambulance: { icon: 'Ambulance', color: 'text-destructive' },
};

export default function EmergencyHelp() {
  const navigate = useNavigate();
  const user = useSelector((state) => state.user.user);
  const [selectedTab, setSelectedTab] = useState('normal');
  const { data, loading } = useFetch(async () => {
    const profileRes = await sdk.table('customer_profiles_c').select(['Id', 'Name', 'email_c', 'location_c', 'latitude_c', 'longitude_c']).where(eq('email_c', user?.emailAddress ?? user?.email ?? '')).page(1, 1).fetch();
    if (!profileRes.success) return { customer: null };
    return { customer: profileRes.data?.[0] };
  }, [user?.emailAddress, user?.email]);

  const customer = data?.customer;
  const latitude = customer?.latitude_c ?? 25.454;
  const longitude = customer?.longitude_c ?? 81.833;
  const location = customer?.location_c ?? 'Current Location';

  const handleEmergency = () => {
    navigate('/customer/ambulance');
  };

  const handleUrgentService = () => {
    navigate('/urgent-service');
  };

  const handleNormalRequest = () => {
    navigate('/requests/new');
  };

  return (
    <div>
      <PageHeader
        eyebrow="Request help"
        title="How can we help?"
        description="Choose the right service for your needs: normal requests, urgent service, or emergency assistance."
      />
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="normal">Normal Service</TabsTrigger>
          <TabsTrigger value="urgent">Urgent Service</TabsTrigger>
          <TabsTrigger value="emergency">Emergency</TabsTrigger>
        </TabsList>

        <TabsContent value="normal" className="space-y-4">
          <Card className="border-l-4 border-primary p-5">
            <div className="mb-4">
              <h3 className="font-heading text-lg font-semibold">Normal Service Request</h3>
              <p className="mt-1 text-sm text-muted-foreground">Post your service request and compare quotes from multiple service providers. Negotiate pricing and confirm your preferred provider.</p>
            </div>
            <Button onClick={handleNormalRequest} className="w-full"><ApperIcon name="Plus" size={17} /> Create New Request</Button>
          </Card>
        </TabsContent>

        <TabsContent value="urgent" className="space-y-4">
          <Card className="border-l-4 border-warning p-5">
            <div className="mb-4">
              <h3 className="font-heading text-lg font-semibold">Urgent Service</h3>
              <p className="mt-1 text-sm text-muted-foreground">Need immediate help without negotiation? Select a nearby service provider by category and confirm instantly.</p>
            </div>
            <Button onClick={handleUrgentService} variant="secondary" className="w-full"><ApperIcon name="AlertCircle" size={17} /> Book Urgent Service</Button>
          </Card>
        </TabsContent>

        <TabsContent value="emergency" className="space-y-4">
          <Card className="border-l-4 border-destructive p-5">
            <div className="mb-4 flex gap-3">
              <ApperIcon name="AlertTriangle" size={20} className="mt-0.5 text-destructive shrink-0" />
              <div>
                <h3 className="font-heading text-lg font-semibold">Emergency Assistance</h3>
                <p className="mt-1 text-sm text-muted-foreground">For emergency medical help, request an ambulance and share your location.</p>
              </div>
            </div>
            <div className="grid gap-2">
              {Object.entries(EMERGENCY_OPTIONS).map(([type, config]) => (
                <Button key={type} onClick={handleEmergency} variant="outline" className="h-auto items-center justify-between p-4 text-left">
                  <ApperIcon name={config.icon} size={18} className="mb-1" />
                  <span className="font-medium text-sm">{type}</span>
                </Button>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}