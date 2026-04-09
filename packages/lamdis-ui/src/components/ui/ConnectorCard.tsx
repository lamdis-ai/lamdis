import Button from '../base/Button';
import Card from '../base/Card';

type Props = { connector: { key: string; name: string; category: string; description?: string } };

export default function ConnectorCard({ connector }: Props) {
  return (
    <Card>
      <div className="font-medium">{connector.name}</div>
      <div className="text-xs text-gray-600">{connector.category}</div>
      <p className="text-sm mt-2">{connector.description}</p>
      <form action={`/api/install/${connector.key}`} method="post">
        <Button className="mt-3">Install</Button>
      </form>
    </Card>
  );
}
