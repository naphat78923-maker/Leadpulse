import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    // Convert empty date and workflow option strings to null
    const payload: any = { ...body, updated_at: new Date().toISOString() };
    if (payload.followup_date === '') payload.followup_date = null;
    if (payload.nudge_stage === '') payload.nudge_stage = null;
    if (payload.sample_status === '') payload.sample_status = null;
    const { data, error } = await supabase
      .from('deals')
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
