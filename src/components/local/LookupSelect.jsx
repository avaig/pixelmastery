import { useFetch } from '@/hooks/useFetch';
import { sdk } from '@/services/sdk';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function LookupSelect({ targetTable, value, onChange, label }) {
  const { data, loading } = useFetch(
    () => sdk.table(targetTable).select(['Id', 'Name']).orderByDesc('CreatedOn').page(1, 100).fetch().then((res) => {
      if (!res.success) throw new Error(res.message);
      return res.data;
    }),
    [targetTable],
  );
  const options = data ?? [];
  return (
    <Select value={value || ''} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={loading ? 'Loading...' : 'Choose ' + label.toLowerCase()} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => <SelectItem key={option.Id} value={String(option.Id)}>{option.Name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}