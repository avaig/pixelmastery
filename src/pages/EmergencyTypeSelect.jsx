import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ApperIcon from '@/components/ApperIcon';
import { PageHeader } from '@/components/local/EntityPages';

const EMERGENCY_TYPES = [
  { id: 'ambulance', name: 'Ambulance', icon: 'Ambulance', color: 'destructive' },
];

export const route = {
  path: '/emergency/type-select',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

export default function EmergencyTypeSelect() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState(null);

  const handleSelect = (typeId) => {
    setSelectedType(typeId);
    navigate('/customer/ambulance');
  };

  return (
    <div>
      <PageHeader
        eyebrow="Emergency Services"
        title="What type of emergency?"
        description="For emergency medical help, request an ambulance and share your location."
        action={<Button asChild variant="ghost" onClick={() => navigate('/customer')}><span>← Back</span></Button>}
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {EMERGENCY_TYPES.map((type) => (
          <Card
            key={type.id}
            className="cursor-pointer border-2 p-6 transition-all hover:border-primary hover:shadow-md"
            onClick={() => handleSelect(type.id)}
          >
            <ApperIcon name={type.icon} size={40} className="mb-3 text-primary" />
            <div className="font-medium text-base">{type.name}</div>
            <Button className="mt-4 w-full" variant="destructive" size="sm">
              Request Ambulance
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}