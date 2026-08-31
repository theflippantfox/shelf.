import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

export async function GET({ cookies, params, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (error) return json({ error: error.message }, { status: 500 });
  if (!data) return json({ error: 'Not found' }, { status: 404 });
  return json(data);
}

export async function PATCH({ cookies, params, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const body = await request.json();
  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('customers')
    .update(body)
    .eq('id', params.id)
    .select()
    .single();
  if (error) return json({ error: error.message }, { status: 400 });
  return json(data);
}

export async function DELETE({ cookies, params, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const supabase = userClientFromCtx({ cookies } as any);
  const { error } = await supabase.from('customers').delete().eq('id', params.id);
  if (error) return json({ error: error.message }, { status: 400 });
  return json({ ok: true });
}