import { useNavigate, useSearchParams } from 'react-router-dom';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/local/EntityPages';

export const route = {
  path: '/emergency/injury-assessment',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

export default function InjuryAssessment() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const emergencyType = params.get('emergencyType');

  const handleInjuryStatus = (status) => {
    const query = new URLSearchParams();
    query.set('emergencyType', emergencyType);
    query.set('injuryStatus', status);

    if (status === 'Injuries Present') {
      navigate(`/emergency/select-provider?${query.toString()}`);
    } else {
      navigate(`/emergency/select-provider?${query.toString()}`);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Emergency assistance"
        title="Are there any injuries?"
        description="This helps us prioritize medical and emergency services."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="cursor-pointer border-2 border-border p-6 transition-all hover:border-success hover:shadow-md"
          onClick={() => handleInjuryStatus('No Injuries')}>
          <div className="flex flex-col items-center gap-4 text-center">
            <ApperIcon name="Check" size={48} className="text-success" />
            <div>
              <h3 className="font-heading text-lg font-semibold">No, everyone is safe</h3>
              <p className="mt-2 text-sm text-muted-foreground">No one is injured. Proceed to arrange help.</p>
            </div>
            <Button className="w-full" size="lg">Select</Button>
          </div>
        </Card>
        <Card className="cursor-pointer border-2 border-border p-6 transition-all hover:border-destructive hover:shadow-md"
          onClick={() => handleInjuryStatus('Injuries Present')}>
          <div className="flex flex-col items-center gap-4 text-center">
            <ApperIcon name="AlertCircle" size={48} className="text-destructive" />
            <div>
              <h3 className="font-heading text-lg font-semibold">Yes, injuries are present</h3>
              <p className="mt-2 text-sm text-muted-foreground">Medical assistance may be needed immediately.</p>
            </div>
            <Button className="w-full" size="lg" variant="destructive">Select</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}