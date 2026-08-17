import { notFound, redirect } from 'next/navigation';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function RootUuidRedirectPage({ params }: { params: { id: string } }) {
  if (UUID_RE.test(params.id)) {
    redirect(`/campaigns/${params.id}`);
  }

  notFound();
}
