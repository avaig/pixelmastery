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
    description: 'Mobil and other compatible engine oil brands.',
    detail: 'Choose the oil grade recommended for your vehicle.',
    icon: 'Droplets',
  },
  {
    id: 'coolant',
    title: 'Engine Coolant',
    description: 'Coolant matched to your vehicle requirements.',
    detail: 'Choose a compatible coolant type and pack size.',
    icon: 'Thermometer',
  },
  {
    id: 'adblue',
    title: 'UREA / Diesel Exhaust Fluid (DEF) / AdBlue',
    description: 'For diesel vehicles equipped with a compatible SCR system.',
    detail: 'Not required for every diesel vehicle.',
    icon: 'Fuel',
  },
];

export default function CarEssentialsDelivery() {
  const navigate = useNavigate();
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [vehicle, setVehicle] = useState('');
  const [location, setLocation] = useState('');

  function toggleProduct(productId) {
    setSelectedProducts((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
    setQuantities((current) => ({
      ...current,
      [productId]: current[productId] || '1',
    }));
  }

  function checkAvailability() {
    if (!selectedProducts.length) {
      toast.error('Please select at least one product.');
      return;
    }
    if (selectedProducts.some((id) => !quantities[id] || Number(quantities[id]) < 1 || Number(quantities[id]) > 20)) {
      toast.error('Enter a quantity between 1 and 20 for each selected product.');
      return;
    }
    if (!vehicle.trim()) {
      toast.error('Enter your car make and model so we can help identify a compatible product.');
      return;
    }
    if (!location.trim()) {
      toast.error('Enter the delivery location.');
      return;
    }
    const orderDetails = {
      vehicle: vehicle.trim(),
      deliveryLocation: location.trim(),
      items: selectedProducts.map((id) => {
        const product = PRODUCTS.find((entry) => entry.id === id);
        return {
          id,
          title: product?.title ?? id,
          quantity: Number(quantities[id] || 1),
        };
      }),
      submittedAt: new Date().toISOString(),
    };
    window.sessionStorage.setItem('local_car_essentials_order_v1', JSON.stringify(orderDetails));
    navigate('/customer/request?vehicle=car&issue=Other%20Issue&service=Car%20Essentials%20Delivery');
  }

  return (
    <div className="mx-auto -mt-3 max-w-5xl space-y-4 sm:mt-0 sm:space-y-6">
      <Button type="button" variant="outline" className="mb-1" onClick={() => navigate('/customer/car-care')}>
        <ApperIcon name="ArrowLeft" size={17} />
        Back to Car Care & Assistance
      </Button>

      <header className="-mt-1 text-center sm:mt-0">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary sm:mb-3 sm:size-14">
          <ApperIcon name="PackageCheck" size={28} />
        </div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Car Essentials at Your Doorstep</h1>
        <p className="mx-auto mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Essential Car Fluids Delivered to Your Location
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
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
              <Card className={'flex h-full min-h-[210px] flex-col border-2 p-5 transition-all ' + (selected ? 'border-primary bg-primary/5 shadow-md' : 'hover:border-primary/50')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ApperIcon name={product.icon} size={26} />
                  </div>
                  <ApperIcon name={selected ? 'CircleCheck' : 'Circle'} size={21} className={selected ? 'text-primary' : 'text-muted-foreground'} />
                </div>
                <h2 className="mt-5 font-semibold leading-snug">{product.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{product.description}</p>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{product.detail}</p>
                {selected && (
                  <div className="mt-4 border-t pt-3" onClick={(event) => event.stopPropagation()}>
                    <label htmlFor={'quantity-' + product.id} className="text-sm font-medium">Quantity / pack count</label>
                    <Input
                      id={'quantity-' + product.id}
                      type="number"
                      min="1"
                      max="20"
                      value={quantities[product.id] || '1'}
                      onChange={(event) => setQuantities((current) => ({ ...current, [product.id]: event.target.value }))}
                      onClick={(event) => event.stopPropagation()}
                      className="mt-2"
                    />
                  </div>
                )}
              </Card>
            </button>
          );
        })}
      </div>

      <Card className="border-2 border-primary/15 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ApperIcon name="MapPin" size={23} />
          </div>
          <div>
            <h2 className="font-semibold">Delivery details</h2>
            <p className="text-sm text-muted-foreground">Tell us what you need and where to deliver it.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-sm font-medium">Selected products</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedProducts.length
                ? selectedProducts.map((id) => PRODUCTS.find((product) => product.id === id)?.title).join(', ')
                : 'Select one or more products above.'}
            </p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="car-essentials-location" className="text-sm font-medium">Delivery location</label>
            <Input
              id="car-essentials-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Enter your location or nearby landmark"
              className="mt-2"
            />
          </div>
        </div>

        <div className="mt-5 rounded-xl border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <ApperIcon name="MapPinned" size={21} className="mt-0.5 text-primary" />
            <div className="space-y-1">
              <p className="font-semibold">Delivered to your location</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Product availability, product price, delivery charges based on distance and delivery time, and estimated arrival will need to be confirmed before you place an order.
              </p>
            </div>
          </div>
        </div>

        <Button type="button" className="mt-5 w-full" onClick={checkAvailability}>
          <ApperIcon name="MapPinCheck" size={17} />
          Check Local Availability
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          No bidding. Review the product and delivery charges before confirming an order.
        </p>
      </Card>
    </div>
  );
}
