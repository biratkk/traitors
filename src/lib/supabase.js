import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// This key is public. Database permissions must protect game data.
export const supabase = url && key ? createClient(url, key) : null
