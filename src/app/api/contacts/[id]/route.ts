import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    // Convert empty strings to null for UUID fields
    const payload: any = { ...body, updated_at: new Date().toISOString() };
    if (payload.company_id === '') payload.company_id = null;
    const { data, error } = await supabase
      .from('contacts')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
