import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkyhikarlxuwvprjabbi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1reWhpa2FybHh1d3ZwcmphYmJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNjk5MjgsImV4cCI6MjEwMjY0NTkyOH0.9FB3HhMl_O-tYmFV1non4iIcKhd_c0_XoFQxzYu4YZg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
