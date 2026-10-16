
import { sdk } from '@/services/sdk';

const { eq } = window.ApperSDK.CoreSDK;

export const CAPABILITY_CATALOG = [
  ['Car Mechanic', 'Car', 'Mechanical breakdown diagnosis and repair for cars.'],
  ['Bike Mechanic', 'Bike', 'Mechanical breakdown diagnosis and repair for bikes.'],
  ['Car Battery Assistance', 'Car', 'Jump start, battery testing and replacement assistance for cars.'],
  ['Bike Battery Assistance', 'Bike', 'Battery diagnosis, jump start and replacement assistance for bikes.'],
  ['Tyre Assistance', 'Both', 'Flat tyre and puncture assistance for cars and bikes.'],
  ['Fuel Delivery', 'Both', 'On-road fuel delivery for customers who have run out of fuel.'],
  ['Car Roadside Assistance', 'Car', 'On-road assistance for car overheating and general roadside problems.'],
  ['Bike Roadside Assistance', 'Bike', 'On-road assistance for bike overheating and general roadside problems.'],
  ['Car Auto Electrical', 'Car', 'Electrical fault diagnosis and repair for cars.'],
  ['Bike Auto Electrical', 'Bike', 'Electrical fault diagnosis and repair for bikes.'],
  ['Key Lockout', 'Both', 'Vehicle lockout and key assistance.'],
  ['Towing Service', 'Both', 'Vehicle towing and recovery assistance.'],
  ['Bike Chain & Drive', 'Bike', 'Chain, sprocket and drive-system assistance for bikes.'],
  ['Bike Clutch & Gear', 'Bike', 'Clutch and gear-system assistance for bikes.'],
  ['Car General Assistance', 'Car', 'General car assistance for issues that do not fit a listed problem.'],
  ['Bike General Assistance', 'Bike', 'General bike assistance for issues that do not fit a listed problem.'],
  ['Car Wash', 'Car', 'Exterior and interior car washing and cleaning services.'],
  ['Car Service', 'Car', 'Routine car maintenance, scheduled servicing and general service work.'],
  ['Hourly Driver', 'Car', 'Driver booking by the hour for short trips and errands.'],
  ['Full-Day Driver', 'Car', 'Driver booking for a full day of travel.'],
  ['Outstation Driver', 'Car', "Driver booking for intercity journeys in the customer's own car."],
  ['Emergency Driver', 'Car', 'Urgent driver booking when the customer cannot drive.'],
  ['Car Rental', 'Car', 'Car rental offers with provider quotes and customer negotiation.'],
  ['AC Technician — Split AC', 'Home Services', 'Home AC servicing, diagnosis and repair for Split AC units.'],
  ['AC Technician — Window AC', 'Home Services', 'Home AC servicing, diagnosis and repair for Window AC units.'],
  ['AC Technician — Split & Window AC', 'Home Services', 'Home AC technician capable of servicing both Split AC and Window AC units.'],
];

export async function getCapabilityCatalog() {
  const result = await sdk.table('service_capabilities_c')
    .select(['Id', 'Name', 'vehicle_type_c', 'description_c', 'status_c'])
    .page(1, 200)
    .fetch();
  if (!result.success) throw new Error(result.message || 'Could not load service capabilities.');
  return result.data ?? [];
}

export async function restoreLocalSetupData() {
  const categorySeeds = [
    ['Car Assistance', 'Car assistance, maintenance, roadside help and driver services.'],
    ['Bike Assistance', 'Bike maintenance, breakdown and roadside assistance.'],
  ];
  const categoryResult = await sdk.table('service_categories_c')
    .select(['Id', 'Name', 'description_c', 'status_c'])
    .page(1, 200)
    .fetch();
  if (!categoryResult.success) throw new Error(categoryResult.message || 'Could not read service categories.');
  const existingCategories = new Set((categoryResult.data ?? []).map((item) => String(item.Name ?? '').trim().toLowerCase()));
  let categoriesAdded = 0;
  for (const [name, description] of categorySeeds) {
    if (existingCategories.has(name.toLowerCase())) continue;
    const created = await sdk.table('service_categories_c').create({ Name: name, description_c: description, status_c: 'Active' });
    if (!created.data?.length) throw new Error(created.messages?.[0] || `Could not create ${name}.`);
    categoriesAdded += 1;
  }

  const capabilityResult = await sdk.table('service_capabilities_c')
    .select(['Id', 'Name', 'vehicle_type_c', 'description_c', 'status_c'])
    .page(1, 200)
    .fetch();
  if (!capabilityResult.success) throw new Error(capabilityResult.message || 'Could not read the service catalogue.');
  const existingCapabilities = new Set((capabilityResult.data ?? []).map((item) => String(item.Name ?? '').trim().toLowerCase()));
  let capabilitiesAdded = 0;
  for (const [name, vehicleType, description] of CAPABILITY_CATALOG) {
    if (existingCapabilities.has(name.toLowerCase())) continue;
    const created = await sdk.table('service_capabilities_c').create({ Name: name, vehicle_type_c: vehicleType, description_c: description, status_c: 'Active' });
    if (!created.data?.length) throw new Error(created.messages?.[0] || `Could not create ${name}.`);
    capabilitiesAdded += 1;
  }
  return { categoriesAdded, capabilitiesAdded };
}
