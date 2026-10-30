import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ApperIcon from '@/components/ApperIcon';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export const route = {
  path: '/customer/car-essentials',
  layout: 'owner',
  access: "profile === 'Customer_c'",
};

const PRODUCTS = [
  {
    id: 'engine-oil',
    title: 'Engine Oil',
    icon: 'Droplets',
  },
  {
    id: 'coolant',
    title: 'Engine Coolant',
    icon: 'Thermometer',
  },
  {
    id: 'adblue',
    title: 'UREA / Diesel Exhaust Fluid (DEF) / AdBlue',
    icon: 'Fuel',
  },
];

export default function CarEssentialsDelivery() {
  const navigate = useNavigate();
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [vehicle, setVehicle] = useState('');

  function toggleProduct(productId) {
    setSelectedProducts((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  }

  async function checkAvailability() {
    if (!selectedProducts.length) {
      toast.error('Please select at least one product.');
      return;
    }
    if (!vehicle.trim()) {
      toast.error('Enter your car make and model so we can help identify a compatible product.');
      return;
    }
    const orderDetails = {
      vehicle: vehicle.trim(),
      items: selectedProducts.map((id) => {
        const product = PRODUCTS.find((entry) => entry.id === id);
        return {
          id,
          title: product?.title ?? id,
        };
      }),
      submittedAt: new Date().toISOString(),
    };
    window.sessionStorage.setItem('local_car_essentials_order_v1', JSON.stringify(orderDetails));
    navigate('/customer/request?vehicle=car&issue=Other%20Issue&service=Car%20Essentials%20Delivery');
  }

  return (
    <div className="mx-auto mt-1 max-w-5xl space-y-2 sm:mt-2 sm:space-y-3">
      <header className="text-center">
        <h1 className="text-lg font-bold tracking-tight sm:text-2xl">Car Essentials at Your Doorstep</h1>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
        {PRODUCTS.map((product) => {
          const selected = selectedProducts.includes(product.id);
          return (
            <button
              key={product.id}
              type="button"
              aria-pressed={selected}
              onClick={() => toggleProduct(product.id)}
              className="h-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Card className={'flex h-full flex-row items-start gap-3 border-2 p-3 transition-all sm:min-h-[190px] sm:flex-col sm:p-5 ' + (selected ? 'border-primary bg-primary/5 shadow-md' : 'hover:border-primary/50')}>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:size-12 sm:rounded-xl">
                  <ApperIcon name={product.icon} size={21} />
                </div>
                <div className="min-w-0 flex-1 sm:w-full">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold leading-snug">{product.title}</h2>
                    <ApperIcon name={selected ? 'CircleCheck' : 'Circle'} size={19} className={'shrink-0 ' + (selected ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                </div>
              </Card>
            </button>
          );
        })}
      </div>

      <Card className="border-2 border-primary/15 p-3 sm:p-4">
        <div className="mb-3">
          <h2 className="font-semibold">Your requirement</h2>
          <p className="text-sm text-muted-foreground">Select the products you need. Our Customer Care team will contact you.</p>
        </div>

        <div className="mt-2 grid gap-2.5 sm:mt-3 sm:grid-cols-2 sm:gap-3">
          <div>
            <label htmlFor="car-essentials-vehicle" className="text-sm font-medium">Car make and model</label>
            <Input
              id="car-essentials-vehicle"
              value={vehicle}
              onChange={(event) => setVehicle(event.target.value)}
              placeholder="e.g. Hyundai Creta 2022"
              className="mt-2"
            />
            <p className="mt-1 text-xs text-muted-foreground">Helps identify the correct product specification.</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Selected products</p>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{selectedProducts.length} selected</span>
            </div>
            {selectedProducts.length ? (
              <ul className="mt-3 space-y-2">
                {selectedProducts.map((id) => {
                  const product = PRODUCTS.find((entry) => entry.id === id);
                  return (
                    <li key={id} className="flex items-start justify-between gap-2 border-t pt-2 first:border-t-0 first:pt-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug">{product?.title ?? id}</p>
                      </div>
                      <button type="button" onClick={() => toggleProduct(id)} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10" aria-label={'Remove ' + (product?.title ?? id)}>Remove</button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">No products selected yet. Choose one or more products above to see them here.</p>
            )}
          </div>
        </div>

        <Button type="button" className="mt-2 w-full sm:mt-3" onClick={checkAvailability}>
          <ApperIcon name="MapPinCheck" size={17} />
          Submit Requirement
        </Button>
        <Button type="button" variant="outline" className="mt-2 w-full" disabled aria-label="Call Customer Care — phone number to be added">
          <ApperIcon name="PhoneCall" size={17} />
          Call Customer Care
        </Button>
      </Card>
    </div>
  );
}
