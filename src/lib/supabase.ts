// Update team members (replace all members for a team)
export const updateTeamMembers = async (teamId: string, memberIds: string[]) => {
  try {
    // Delete existing members
    const { error: delError } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId);
    if (delError) throw delError;

    // Wait for DB to process deletes (avoid race condition)
    await new Promise(resolve => setTimeout(resolve, 250));

    // Deduplicate memberIds
    const uniqueMemberIds = Array.from(new Set(memberIds));

    // Insert new members
    if (uniqueMemberIds.length > 0) {
      const inserts = uniqueMemberIds.map(id => ({ team_id: teamId, user_id: id }));
      const { error: insError } = await supabase
        .from('team_members')
        .insert(inserts);
      if (insError) throw insError;
    }
    return { success: true, error: null };
  } catch (error) {
    logSupabaseError('updateTeamMembers', error);
    return { success: false, error: error as any };
  }
};
export const deleteTeam = async (id: string) => {
  try {
    console.log('Starting team deletion for id:', id);
    
    // First delete related team_members
    const { error: memberError, data: memberData } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', id)
      .select();
    
    if (memberError) {
      console.error('Error deleting team_members:', memberError);
      throw memberError;
    }
    
    console.log('Deleted team_members:', memberData?.length || 0, 'rows');

    // Wait a bit for DB to process deletes
    await new Promise(resolve => setTimeout(resolve, 200));

    // Now delete the team
    const { error, data } = await supabase
      .from('teams')
      .delete()
      .eq('id', id)
      .select();
    
    console.log('Team delete response - error:', error, 'data:', data);
    
    if (error) {
      console.error('Error deleting team:', error);
      throw error;
    }

    // Check if any rows were actually deleted
    // If RLS blocks the delete, data will be empty array even though error is null
    if (!data || data.length === 0) {
      console.warn('Team deletion returned no rows - likely blocked by RLS');
      
      // Try to verify if team still exists (this might also be blocked by RLS)
      const { data: verifyData, error: verifyError } = await supabase
        .from('teams')
        .select('id, manager_id')
        .eq('id', id)
        .maybeSingle();
      
      console.log('Verification query - data:', verifyData, 'error:', verifyError);
      
      if (verifyData) {
        return { 
          success: false, 
          error: { 
            message: `Team deletion blocked by RLS policy. Team still exists. Manager ID: ${verifyData.manager_id}, Current user may not match manager_id.`,
            details: 'The DELETE policy requires auth.uid() = manager_id or user role = owner. Please verify your user role and that you are the team manager.',
            code: 'RLS_POLICY_VIOLATION'
          } 
        };
      } else {
        // Team doesn't exist, but delete returned no rows - might be a race condition
        // Or RLS is blocking both delete and select
        return { 
          success: false, 
          error: { 
            message: 'Team deletion may have been blocked by RLS policy. Unable to verify deletion status.',
            details: 'Please check: 1) Your user role is manager or owner, 2) You are the manager of this team (manager_id matches your user id), 3) RLS policies are correctly configured.',
            code: 'RLS_POLICY_VIOLATION'
          } 
        };
      }
    }

    // Success - rows were deleted
    console.log('Team deleted successfully:', data);
    return { success: true, error: null };
  } catch (error: any) {
    logSupabaseError('deleteTeam', error);
    return { 
      success: false, 
      error: {
        message: error?.message || 'Unknown error',
        details: error?.details || error?.hint || '',
        code: error?.code || ''
      }
    };
  }
};
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://uvqlonqtlqypxqatgbih.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_A8iz_SOWHx_G5eKQZGgfMg_csYrQ5Q8';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const logSupabaseError = (context: string, error: any) => {
  if (error) {
    console.error(`[Supabase Error in ${context}]`, {
      message: error?.message || error,
      details: error?.details,
      hint: error?.hint,
      code: error?.code,
      fullError: error
    });
  }
};

// ============================================================================
// AUTHENTICATION FUNCTIONS
// ============================================================================

export const testConnection = async () => {
  try {
    console.log('[Supabase] Testing connection...');
    const { data, error } = await supabase.from('users').select('count', { count: 'exact', head: true });
    
    if (error) {
      console.error('[Supabase] Connection test failed:', error);
      return { success: false, error };
    }
    
    console.log('[Supabase] Connection successful!');
    return { success: true, error: null };
  } catch (err) {
    console.error('[Supabase] Connection test error:', err);
    return { success: false, error: err };
  }
};

export const signUpWithEmail = async (email: string, password: string, fullName: string, role: 'owner' | 'manager' | 'salesman' = 'salesman') => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: role
        }
      }
    });
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as any };
  }
};

// Create salesman account - for managers to create salesman accounts
export const createSalesmanAccount = async (email: string, password: string, fullName: string, managerId?: string) => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: 'salesman'
        }
      }
    });
    
    if (error) throw error;
    
    // Create user profile in database
    if (data.user) {
      const { error: profileError } = await supabase
        .from('users')
        .upsert({
          id: data.user.id,
          email,
          full_name: fullName,
          role: 'salesman',
          manager_id: managerId || null,
        }, { onConflict: 'id' });
      
      if (profileError) {
        console.error('Error creating user profile:', profileError);
        // Still return success as auth user was created
      }
    }
    
    return { data, error: null, password }; // Return password so manager can share it
  } catch (error) {
    return { data: null, error: error as any, password: null };
  }
};

export const signInWithEmail = async (email: string, password: string) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) throw error;
    
    // Track login session
    if (data.user) {
      try {
        await createUserSession(data.user.id);
      } catch (sessionError) {
        console.error('Failed to track login session:', sessionError);
        // Don't fail the login if session tracking fails
      }
    }
    
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as any };
  }
};

export const signOut = async () => {
  try {
    // Get current user before signing out
    const { data: { user } } = await supabase.auth.getUser();
    
    // Track logout session
    if (user) {
      try {
        await updateUserSessionLogout(user.id);
      } catch (sessionError) {
        console.error('Failed to track logout session:', sessionError);
        // Don't fail the logout if session tracking fails
      }
    }
    
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error as any };
  }
};

export const getCurrentUser = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  } catch (error) {
    console.error('[getCurrentUser] Error:', error);
    return null;
  }
};

export const getSession = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
  } catch (error) {
    console.error('[getSession] Error:', error);
    return null;
  }
};

// ============================================================================
// USER FUNCTIONS
// ============================================================================

export const getUsers = async () => {
  try {
    const { data, error } = await supabase.from('users').select('*');
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError('getUsers', error);
    return { data: [], error: error as any };
  }
};

export const getUserById = async (id: string, forceRefresh: boolean = true) => {
  try {
    // Force fresh session if requested
    if (forceRefresh) {
      await supabase.auth.getSession();
    }
    
    // Always fetch fresh data from database
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('getUserById', error);
    return { data: null, error: error as any };
  }
};

export const getUsersByRole = async (role: 'owner' | 'manager' | 'salesman') => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', role);
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError('getUsersByRole', error);
    return { data: [], error: error as any };
  }
};

export const createUser = async (userData: {
  email: string;
  full_name: string;
  role: 'owner' | 'manager' | 'salesman';
  phone?: string;
  avatar_url?: string;
  manager_id?: string;
  department?: string;
}) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .insert([userData])
      .select();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('createUser', error);
    return { data: null, error: error as any };
  }
};

export const updateUser = async (id: string, updates: any) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('updateUser', error);
    return { data: null, error: error as any };
  }
};

export const deleteUser = async (id: string) => {
  try {
    // First delete from auth (if possible)
    // Note: Admin API is required for this, so we'll just delete from users table
    // The auth user will remain but won't have access
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('deleteUser', error);
    return { error: error as any };
  }
};

// ============================================================================
// LEADS FUNCTIONS
// ============================================================================

export const getLeads = async (filters?: { status?: string; assignedTo?: string; projectId?: string }) => {
  try {
    let query = supabase.from('leads').select('*, projects(name)');
    
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.assignedTo) query = query.eq('assigned_to', filters.assignedTo);
    if (filters?.projectId) query = query.eq('project_id', filters.projectId);
    
    const { data, error } = await query;
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError('getLeads', error);
    return { data: [], error: error as any };
  }
};

export const getLeadById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('getLeadById', error);
    return { data: null, error: error as any };
  }
};

export const createLead = async (leadData: {
  company_name: string;
  contact_name?: string;
  email?: string | null;
  phone?: string | null;
  status?: 'new' | 'qualified' | 'proposal' | 'closed_won' | 'not_interested';
  value?: number;
  assigned_to?: string | null;
  project_id: string;
  description?: string;
  link?: string;
  // New comprehensive fields
  designation?: string | null;
  mobile_phone?: string | null;
  direct_phone?: string | null;
  office_phone?: string | null;
  linkedin?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zip?: string | null;
  customer_group?: string | null;
  product_group?: string | null;
  tags?: string[] | null;
  lead_source?: string | null;
  data_source?: string | null;
  lead_score?: number | null;
  next_followup_date?: string | null;
  followup_notes?: string | null;
  repeat_followup?: boolean | null;
  do_not_followup?: boolean | null;
  do_not_followup_reason?: string | null;
  lead_notes?: string | null;
  organization_notes?: string | null;
  date_of_birth?: string | null;
  special_event_date?: string | null;
  reference_url1?: string | null;
  reference_url2?: string | null;
  reference_url3?: string | null;
  list_name?: string | null;
  priority?: string | null;
  industry?: string | null;
  software_category?: string | null;
}) => {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error('User must be logged in to create leads');
    
    const leadWithCreator: any = {
      ...leadData,
      // Explicitly set email and phone to null if empty or undefined
      email: leadData.email && String(leadData.email).trim() ? String(leadData.email).trim() : null,
      phone: leadData.phone && String(leadData.phone).trim() ? String(leadData.phone).trim() : null,
      created_by: currentUser.id,
      // Preserve assigned_to if provided (for salesman auto-assignment)
      assigned_to: leadData.assigned_to || null,
      status: leadData.status || 'new',
      value: leadData.value || 0,
      // Handle new fields - only include if they have values
      ...(leadData.designation && { designation: String(leadData.designation).trim() }),
      ...(leadData.mobile_phone && { mobile_phone: String(leadData.mobile_phone).trim() }),
      ...(leadData.direct_phone && { direct_phone: String(leadData.direct_phone).trim() }),
      ...(leadData.office_phone && { office_phone: String(leadData.office_phone).trim() }),
      ...(leadData.linkedin && { linkedin: String(leadData.linkedin).trim() }),
      ...(leadData.address_line1 && { address_line1: String(leadData.address_line1).trim() }),
      ...(leadData.address_line2 && { address_line2: String(leadData.address_line2).trim() }),
      ...(leadData.city && { city: String(leadData.city).trim() }),
      ...(leadData.state && { state: String(leadData.state).trim() }),
      ...(leadData.country && { country: String(leadData.country).trim() }),
      ...(leadData.zip && { zip: String(leadData.zip).trim() }),
      ...(leadData.customer_group && { customer_group: String(leadData.customer_group).trim() }),
      ...(leadData.product_group && { product_group: String(leadData.product_group).trim() }),
      ...(leadData.tags && Array.isArray(leadData.tags) && { tags: leadData.tags }),
      ...(leadData.lead_source && { lead_source: String(leadData.lead_source).trim() }),
      ...(leadData.data_source && { data_source: String(leadData.data_source).trim() }),
      ...(leadData.lead_score !== undefined && leadData.lead_score !== null && { lead_score: Number(leadData.lead_score) }),
      ...(leadData.next_followup_date && { next_followup_date: leadData.next_followup_date }),
      ...(leadData.followup_notes && { followup_notes: String(leadData.followup_notes).trim() }),
      ...(leadData.repeat_followup !== undefined && { repeat_followup: Boolean(leadData.repeat_followup) }),
      ...(leadData.do_not_followup !== undefined && { do_not_followup: Boolean(leadData.do_not_followup) }),
      ...(leadData.do_not_followup_reason && { do_not_followup_reason: String(leadData.do_not_followup_reason).trim() }),
      ...(leadData.lead_notes && { lead_notes: String(leadData.lead_notes).trim() }),
      ...(leadData.organization_notes && { organization_notes: String(leadData.organization_notes).trim() }),
      ...(leadData.date_of_birth && { date_of_birth: leadData.date_of_birth }),
      ...(leadData.special_event_date && { special_event_date: leadData.special_event_date }),
      ...(leadData.reference_url1 && { reference_url1: String(leadData.reference_url1).trim() }),
      ...(leadData.reference_url2 && { reference_url2: String(leadData.reference_url2).trim() }),
      ...(leadData.reference_url3 && { reference_url3: String(leadData.reference_url3).trim() }),
      ...(leadData.list_name && { list_name: String(leadData.list_name).trim() }),
    };
    
    const { data, error } = await supabase
      .from('leads')
      .insert([leadWithCreator])
      .select();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('createLead', error);
    return { data: null, error: error as any };
  }
};

export const createBulkLeads = async (leads: Array<{
  company_name: string;
  contact_name?: string;
  email?: string;
  contact_email?: string;
  phone?: string;
  contact_phone?: string;
  project_id: string;
  description?: string;
  link?: string;
  value?: number;
  assigned_to?: string | null;
  // New comprehensive fields
  designation?: string | null;
  mobile_phone?: string | null;
  direct_phone?: string | null;
  office_phone?: string | null;
  linkedin?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zip?: string | null;
  customer_group?: string | null;
  product_group?: string | null;
  tags?: string[] | null;
  lead_source?: string | null;
  data_source?: string | null;
  lead_score?: number | null;
  next_followup_date?: string | null;
  followup_notes?: string | null;
  repeat_followup?: boolean | null;
  do_not_followup?: boolean | null;
  do_not_followup_reason?: string | null;
  lead_notes?: string | null;
  organization_notes?: string | null;
  date_of_birth?: string | null;
  special_event_date?: string | null;
  reference_url1?: string | null;
  reference_url2?: string | null;
  reference_url3?: string | null;
  list_name?: string | null;
  priority?: string | null;
  industry?: string | null;
  software_category?: string | null;
  status?: string | null;
}>) => {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error('User must be logged in to create leads');
    
    const leadsWithCreator = leads.map(lead => {
      // Extract phone and email values (support both naming conventions)
      const phoneValue = String(lead.phone || lead.contact_phone || '').trim();
      const emailValue = String(lead.email || lead.contact_email || '').trim();
      
      // Only include fields that exist in the database schema
      const leadData: any = {
        company_name: String(lead.company_name || '').trim(),
        contact_name: String(lead.contact_name || '').trim(),
        project_id: lead.project_id,
        created_by: currentUser.id,
        status: 'new',
        value: lead.value || 0,
        // Explicitly set email and phone to null if empty (database allows null)
        email: emailValue || null,
        phone: phoneValue || null,
      };
      
      // Preserve assigned_to if provided (for salesman auto-assignment)
      // Always set assigned_to if it's provided, even if it's an empty string (will be converted to null)
      if (lead.assigned_to !== undefined && lead.assigned_to !== null) {
        leadData.assigned_to = String(lead.assigned_to).trim() || null;
      } else {
        leadData.assigned_to = null;
      }
      
      // Add optional fields only if they have values
      if (lead.description && String(lead.description).trim()) {
        leadData.description = String(lead.description).trim();
      }
      if (lead.link && String(lead.link).trim()) {
        leadData.link = String(lead.link).trim();
      }
      
      // Add new comprehensive fields
      if (lead.designation && String(lead.designation).trim()) {
        leadData.designation = String(lead.designation).trim();
      }
      if (lead.mobile_phone && String(lead.mobile_phone).trim()) {
        leadData.mobile_phone = String(lead.mobile_phone).trim();
      }
      if (lead.direct_phone && String(lead.direct_phone).trim()) {
        leadData.direct_phone = String(lead.direct_phone).trim();
      }
      if (lead.office_phone && String(lead.office_phone).trim()) {
        leadData.office_phone = String(lead.office_phone).trim();
      }
      if (lead.linkedin && String(lead.linkedin).trim()) {
        leadData.linkedin = String(lead.linkedin).trim();
      }
      if (lead.address_line1 && String(lead.address_line1).trim()) {
        leadData.address_line1 = String(lead.address_line1).trim();
      }
      if (lead.address_line2 && String(lead.address_line2).trim()) {
        leadData.address_line2 = String(lead.address_line2).trim();
      }
      if (lead.city && String(lead.city).trim()) {
        leadData.city = String(lead.city).trim();
      }
      if (lead.state && String(lead.state).trim()) {
        leadData.state = String(lead.state).trim();
      }
      if (lead.country && String(lead.country).trim()) {
        leadData.country = String(lead.country).trim();
      }
      if (lead.zip && String(lead.zip).trim()) {
        leadData.zip = String(lead.zip).trim();
      }
      if (lead.customer_group && String(lead.customer_group).trim()) {
        leadData.customer_group = String(lead.customer_group).trim();
      }
      if (lead.product_group && String(lead.product_group).trim()) {
        leadData.product_group = String(lead.product_group).trim();
      }
      if (lead.tags && Array.isArray(lead.tags)) {
        leadData.tags = lead.tags;
      }
      if (lead.lead_source && String(lead.lead_source).trim()) {
        leadData.lead_source = String(lead.lead_source).trim();
      }
      if (lead.data_source && String(lead.data_source).trim()) {
        leadData.data_source = String(lead.data_source).trim();
      }
      if (lead.lead_score !== undefined && lead.lead_score !== null) {
        leadData.lead_score = Number(lead.lead_score);
      }
      if (lead.next_followup_date) {
        leadData.next_followup_date = lead.next_followup_date;
      }
      if (lead.followup_notes && String(lead.followup_notes).trim()) {
        leadData.followup_notes = String(lead.followup_notes).trim();
      }
      if (lead.repeat_followup !== undefined) {
        leadData.repeat_followup = Boolean(lead.repeat_followup);
      }
      if (lead.do_not_followup !== undefined) {
        leadData.do_not_followup = Boolean(lead.do_not_followup);
      }
      if (lead.do_not_followup_reason && String(lead.do_not_followup_reason).trim()) {
        leadData.do_not_followup_reason = String(lead.do_not_followup_reason).trim();
      }
      if (lead.lead_notes && String(lead.lead_notes).trim()) {
        leadData.lead_notes = String(lead.lead_notes).trim();
      }
      if (lead.organization_notes && String(lead.organization_notes).trim()) {
        leadData.organization_notes = String(lead.organization_notes).trim();
      }
      if (lead.date_of_birth) {
        leadData.date_of_birth = lead.date_of_birth;
      }
      if (lead.special_event_date) {
        leadData.special_event_date = lead.special_event_date;
      }
      if (lead.reference_url1 && String(lead.reference_url1).trim()) {
        leadData.reference_url1 = String(lead.reference_url1).trim();
      }
      if (lead.reference_url2 && String(lead.reference_url2).trim()) {
        leadData.reference_url2 = String(lead.reference_url2).trim();
      }
      if (lead.reference_url3 && String(lead.reference_url3).trim()) {
        leadData.reference_url3 = String(lead.reference_url3).trim();
      }
      if (lead.list_name && String(lead.list_name).trim()) {
        leadData.list_name = String(lead.list_name).trim();
      }
      if (lead.priority && String(lead.priority).trim()) {
        leadData.priority = String(lead.priority).trim();
      }
      if (lead.industry && String(lead.industry).trim()) {
        leadData.industry = String(lead.industry).trim();
      }
      if (lead.software_category && String(lead.software_category).trim()) {
        leadData.software_category = String(lead.software_category).trim();
      }
      if (lead.status && String(lead.status).trim()) {
        leadData.status = String(lead.status).trim();
      }

      return leadData;
    });
    
    const { data, error } = await supabase
      .from('leads')
      .insert(leadsWithCreator)
      .select();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('createBulkLeads', error);
    return { data: null, error: error as any };
  }
};

export const updateLead = async (id: string, updates: any) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', id)
      .select();
    
    if (error) throw error;
    
    // Log activity if status changed
    if (updates.status) {
      const lead = await getLeadById(id);
      if (lead.data) {
        await createLeadActivity({
          lead_id: id,
          type: 'status_change',
          description: `Status changed to ${updates.status}`,
          changed_to: updates.status
        });
      }
    }
    
    return { data, error: null };
  } catch (error) {
    logSupabaseError('updateLead', error);
    return { data: null, error: error as any };
  }
};

export const deleteLead = async (id: string) => {
  try {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('deleteLead', error);
    return { error: error as any };
  }
};

export const getLeadsForProject = async (projectId: string) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError('getLeadsForProject', error);
    return { data: [], error: error as any };
  }
};

export const getLeadsByStatus = async (status: 'new' | 'qualified' | 'proposal' | 'closed_won' | 'not_interested') => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError('getLeadsByStatus', error);
    return { data: [], error: error as any };
  }
};

// ============================================================================
// TEAMS FUNCTIONS
// ============================================================================

export const getTeams = async () => {
  try {
    const { data, error } = await supabase.from('teams').select('*');
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError('getTeams', error);
    return { data: [], error: error as any };
  }
};

export const getTeamById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('getTeamById', error);
    return { data: null, error: error as any };
  }
};

export const createTeam = async (teamData: {
  name: string;
  manager_id: string;
  description?: string;
}) => {
  try {
    const { data, error } = await supabase
      .from('teams')
      .insert([teamData])
      .select();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('createTeam', error);
    return { data: null, error: error as any };
  }
};

export const updateTeam = async (id: string, updates: any) => {
  try {
    const { data, error } = await supabase
      .from('teams')
      .update(updates)
      .eq('id', id)
      .select();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('updateTeam', error);
    return { data: null, error: error as any };
  }
};

// ============================================================================
// ACTIVITIES FUNCTIONS
// ============================================================================

export const getActivities = async (userId?: string) => {
  try {
    let query = supabase.from('activities').select('*');
    if (userId) query = query.eq('user_id', userId);
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError('getActivities', error);
    return { data: [], error: error as any };
  }
};

export const createActivity = async (activityData: {
  type: 'call' | 'email' | 'meeting' | 'task' | 'note' | 'status_change' | 'lead_created' | 'lead_assigned';
  title: string;
  description?: string;
  user_id: string;
  lead_id?: string;
  project_id?: string;
  metadata?: any;
}) => {
  try {
    const { data, error } = await supabase
      .from('activities')
      .insert([activityData])
      .select();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('createActivity', error);
    return { data: null, error: error as any };
  }
};

// ============================================================================
// LEAD ACTIVITIES FUNCTIONS
// ============================================================================

export const getActivitiesForLead = async (leadId: string) => {
  try {
    const { data, error } = await supabase
      .from('lead_activities')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError('getActivitiesForLead', error);
    return { data: [], error: error as any };
  }
};

export const createLeadActivity = async (activityData: {
  lead_id: string;
  type: 'status_change' | 'assignment' | 'note' | 'call' | 'email' | 'meeting';
  description?: string;
  changed_from?: string;
  changed_to?: string;
  user_id?: string;
}) => {
  try {
    const currentUser = await getCurrentUser();
    const userId = activityData.user_id || currentUser?.id;
    
    if (!userId) throw new Error('User must be logged in');
    
    const { data, error } = await supabase
      .from('lead_activities')
      .insert([{ ...activityData, user_id: userId }])
      .select();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('createLeadActivity', error);
    return { data: null, error: error as any };
  }
};

// ============================================================================
// PROJECTS FUNCTIONS
// ============================================================================

export const getProjects = async () => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError('getProjects', error);
    return { data: [], error: error as any };
  }
};

export const getProjectById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('getProjectById', error);
    return { data: null, error: error as any };
  }
};

export const createProject = async (project: {
  name: string;
  description?: string;
  budget?: number;
  revenue_target?: number;
  status?: 'active' | 'paused' | 'completed' | 'archived';
  owner_id?: string;
  manager_id?: string;
  start_date?: string;
  end_date?: string;
  link?: string;
}) => {
  try {
    const currentUser = await getCurrentUser();
    const ownerId = project.owner_id || currentUser?.id;
    
    if (!ownerId) throw new Error('Owner ID is required');
    
    const { data, error } = await supabase
      .from('projects')
      .insert([{
        ...project,
        owner_id: ownerId,
        status: project.status || 'active',
      }])
      .select();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('createProject', error);
    return { data: null, error: error as any };
  }
};

export const updateProject = async (id: string, updates: {
  name?: string;
  description?: string;
  budget?: number;
  revenue_target?: number;
  status?: string;
  link?: string;
  start_date?: string;
  end_date?: string;
  manager_id?: string;
}) => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('updateProject', error);
    return { data: null, error: error as any };
  }
};

export const deleteProject = async (id: string) => {
  try {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('deleteProject', error);
    return { error: error as any };
  }
};

// ============================================================================
// LEAD LISTS FUNCTIONS
// ============================================================================

export const getLeadLists = async () => {
  try {
    const { data, error } = await supabase
      .from('lead_lists')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError('getLeadLists', error);
    return { data: [], error: error as any };
  }
};

export const createLeadList = async (list: {
  name: string;
  filters: any;
  description?: string;
}) => {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error('User must be logged in');
    
    const { data, error } = await supabase
      .from('lead_lists')
      .insert([{ ...list, owner_id: currentUser.id }])
      .select();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('createLeadList', error);
    return { data: null, error: error as any };
  }
};

export const deleteLeadList = async (id: string) => {
  try {
    const { error } = await supabase.from('lead_lists').delete().eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('deleteLeadList', error);
    return { error: error as any };
  }
};

// ============================================================================
// REALTIME SUBSCRIPTIONS
// ============================================================================

export const subscribeToLeads = (callback: (payload: any) => void) => {
  const subscription = supabase
    .channel('public:leads')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'leads' },
      (payload) => {
        callback(payload);
      }
    )
    .subscribe();
  
  return subscription;
};

export const subscribeToUsers = (callback: (payload: any) => void) => {
  const subscription = supabase
    .channel('public:users')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'users' },
      (payload) => {
        callback(payload);
      }
    )
    .subscribe();
  
  return subscription;
};

export const subscribeToProjects = (callback: (payload: any) => void) => {
  const subscription = supabase
    .channel('public:projects')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'projects' },
      (payload) => {
        callback(payload);
      }
    )
    .subscribe();
  
  return subscription;
};

export const subscribeToLeadActivities = (leadId: string, callback: (payload: any) => void) => {
  const subscription = supabase
    .channel(`public:lead_activities:${leadId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'lead_activities', filter: `lead_id=eq.${leadId}` },
      (payload) => {
        callback(payload);
      }
    )
    .subscribe();
  
  return subscription;
};

export const subscribeToActivities = (callback: (payload: any) => void) => {
  const subscription = supabase
    .channel('public:activities')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'activities' },
      (payload) => {
        callback(payload);
      }
    )
    .subscribe();
  
  return subscription;
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export const unsubscribeAll = async () => {
  try {
    await supabase.removeAllChannels();
  } catch (error) {
    console.error('[unsubscribeAll] Error:', error);
  }
};

export const getLeadStats = async () => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('status, value', { count: 'exact' });
    
    if (error) throw error;
    
    const stats = {
      total: data?.length || 0,
      new: data?.filter(l => l.status === 'new').length || 0,
      qualified: data?.filter(l => l.status === 'qualified').length || 0,
      proposal: data?.filter(l => l.status === 'proposal').length || 0,
      closedWon: data?.filter(l => l.status === 'closed_won').length || 0,
      notInterested: data?.filter(l => l.status === 'not_interested').length || 0,
      totalValue: data?.reduce((sum, l) => sum + (l.value || 0), 0) || 0,
    };
    
    return { data: stats, error: null };
  } catch (error) {
    logSupabaseError('getLeadStats', error);
    return { data: null, error: error as any };
  }
};

export const getProjectStats = async (projectId: string) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('status, value')
      .eq('project_id', projectId);
    
    if (error) throw error;
    
    const stats = {
      total: data?.length || 0,
      qualified: data?.filter(l => l.status === 'qualified').length || 0,
      proposal: data?.filter(l => l.status === 'proposal').length || 0,
      closedWon: data?.filter(l => l.status === 'closed_won').length || 0,
      value: data?.reduce((sum, l) => sum + (l.value || 0), 0) || 0,
      closedWonValue: data?.filter(l => l.status === 'closed_won').reduce((sum, l) => sum + (l.value || 0), 0) || 0,
    };
    
    return { data: stats, error: null };
  } catch (error) {
    logSupabaseError('getProjectStats', error);
    return { data: null, error: error as any };
  }
};

// ============================================================================
// ROLE UTILITIES - Single source of truth for role checking
// ============================================================================

type UserRole = "owner" | "manager" | "salesman";

/**
 * Normalizes role value to valid UserRole or null
 * This is the ONLY function that should normalize roles
 */
export const normalizeRole = (value: unknown): UserRole | null => {
  const role = String(value ?? "").toLowerCase().trim();
  if (role === "owner" || role === "manager" || role === "salesman") {
    return role;
  }
  return null;
};

/**
 * Gets user role from database - ALWAYS the source of truth
 * Forces fresh session and data fetch to prevent stale data
 */
export const getUserRole = async (userId: string): Promise<UserRole | null> => {
  try {
    // Force fresh session
    await supabase.auth.getSession();
    
    // Force fresh user data fetch
    const { data: userData, error } = await getUserById(userId, true);
    
    if (error || !userData) {
      console.error('Failed to fetch user data for role check:', error);
      return null;
    }
    
    // Database role is ALWAYS the source of truth
    const dbRole = normalizeRole(userData.role);
    
    // If DB role exists, return it
    if (dbRole) {
      return dbRole;
    }
    
    // If DB role is missing, try to get from auth metadata and sync to DB
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const metaRole = normalizeRole(
        user.user_metadata?.role ?? user.app_metadata?.role
      );
      
      if (metaRole) {
        // Sync metadata role to DB
        await updateUser(userId, { role: metaRole });
        // Re-fetch to get the synced role
        const { data: updatedUserData } = await getUserById(userId, true);
        if (updatedUserData) {
          return normalizeRole(updatedUserData.role);
        }
        return metaRole;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
};

// ============================================================================
// USER SESSIONS FUNCTIONS (Login/Logout Tracking)
// ============================================================================

export const createUserSession = async (userId: string, ipAddress?: string, userAgent?: string) => {
  try {
    const { data, error } = await supabase
      .from('user_sessions')
      .insert([{
        user_id: userId,
        login_time: new Date().toISOString(),
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
      }])
      .select()
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('createUserSession', error);
    return { data: null, error: error as any };
  }
};

export const updateUserSessionLogout = async (userId: string) => {
  try {
    console.log('[updateUserSessionLogout] Updating logout for userId:', userId);
    
    // Find the most recent session without a logout time
    const { data: activeSession, error: findError } = await supabase
      .from('user_sessions')
      .select('id, login_time')
      .eq('user_id', userId)
      .is('logout_time', null)
      .order('login_time', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    console.log('[updateUserSessionLogout] Active session found:', activeSession);
    
    if (findError && findError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('[updateUserSessionLogout] Error finding session:', findError);
      throw findError;
    }
    
    if (!activeSession) {
      console.log('[updateUserSessionLogout] No active session to update');
      return { data: null, error: null }; // No active session to update
    }
    
    const logoutTime = new Date().toISOString();
    console.log('[updateUserSessionLogout] Setting logout_time to:', logoutTime);
    
    const { data, error } = await supabase
      .from('user_sessions')
      .update({
        logout_time: logoutTime,
      })
      .eq('id', activeSession.id)
      .select()
      .single();
    
    console.log('[updateUserSessionLogout] Update result - data:', data, 'error:', error);
    
    if (error) {
      console.error('[updateUserSessionLogout] Update error:', error);
      throw error;
    }
    
    return { data, error: null };
  } catch (error) {
    console.error('[updateUserSessionLogout] Exception:', error);
    logSupabaseError('updateUserSessionLogout', error);
    return { data: null, error: error as any };
  }
};

export const getUserSessions = async (userId: string, limit: number = 100) => {
  try {
    console.log('[getUserSessions] Fetching sessions for userId:', userId);
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('login_time', { ascending: false })
      .limit(limit);
    
    console.log('[getUserSessions] Query result - data:', data, 'error:', error);
    
    if (error) {
      console.error('[getUserSessions] Supabase error:', error);
      throw error;
    }
    
    // For each session, get projects worked on during that time period
    if (data && data.length > 0) {
      const sessionsWithProjects = await Promise.all(
        data.map(async (session) => {
          const loginTime = new Date(session.login_time);
          const logoutTime = session.logout_time ? new Date(session.logout_time) : new Date();
          
          // Get unique project names
          const projectNames = new Set<string>();
          
          try {
            // Get leads assigned to this user that were updated during the session
            // This includes status changes, field updates, etc.
            const { data: leadsData } = await supabase
              .from('leads')
              .select('project_id')
              .eq('assigned_to', userId)
              .gte('updated_at', loginTime.toISOString())
              .lte('updated_at', logoutTime.toISOString());
            
            if (leadsData && leadsData.length > 0) {
              const projectIds = [...new Set(leadsData.map((l: any) => l.project_id).filter(Boolean))];
              if (projectIds.length > 0) {
                const { data: projectsData } = await supabase
                  .from('projects')
                  .select('name')
                  .in('id', projectIds);
                
                if (projectsData) {
                  projectsData.forEach((project: any) => {
                    if (project.name) {
                      projectNames.add(project.name);
                    }
                  });
                }
              }
            }
          } catch (error) {
            console.error('Error fetching leads for session:', error);
          }
          
          try {
            // Check all lead activities during the session (notes, calls, emails, status changes, etc.)
            const { data: activitiesData } = await supabase
              .from('lead_activities')
              .select('lead_id')
              .eq('user_id', userId)
              .gte('created_at', loginTime.toISOString())
              .lte('created_at', logoutTime.toISOString());
            
            if (activitiesData && activitiesData.length > 0) {
              const leadIds = [...new Set(activitiesData.map((a: any) => a.lead_id).filter(Boolean))];
              if (leadIds.length > 0) {
                const { data: leadsFromActivities } = await supabase
                  .from('leads')
                  .select('project_id')
                  .in('id', leadIds);
                
                if (leadsFromActivities) {
                  const projectIds = [...new Set(leadsFromActivities.map((l: any) => l.project_id).filter(Boolean))];
                  if (projectIds.length > 0) {
                    const { data: projectsData } = await supabase
                      .from('projects')
                      .select('name')
                      .in('id', projectIds);
                    
                    if (projectsData) {
                      projectsData.forEach((project: any) => {
                        if (project.name) {
                          projectNames.add(project.name);
                        }
                      });
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error fetching activities for session:', error);
          }
          
          try {
            // Also check general activities table (if it exists and has project_id)
            const { data: generalActivities } = await supabase
              .from('activities')
              .select('project_id')
              .eq('user_id', userId)
              .gte('created_at', loginTime.toISOString())
              .lte('created_at', logoutTime.toISOString())
              .not('project_id', 'is', null);
            
            if (generalActivities && generalActivities.length > 0) {
              const projectIds = [...new Set(generalActivities.map((a: any) => a.project_id).filter(Boolean))];
              if (projectIds.length > 0) {
                const { data: projectsData } = await supabase
                  .from('projects')
                  .select('name')
                  .in('id', projectIds);
                
                if (projectsData) {
                  projectsData.forEach((project: any) => {
                    if (project.name) {
                      projectNames.add(project.name);
                    }
                  });
                }
              }
            }
          } catch (error) {
            // activities table might not have project_id, ignore error
            console.log('Activities table query skipped:', error);
          }
          
          try {
            // Check leads that were created during the session
            const { data: createdLeads } = await supabase
              .from('leads')
              .select('project_id')
              .eq('created_by', userId)
              .gte('created_at', loginTime.toISOString())
              .lte('created_at', logoutTime.toISOString());
            
            if (createdLeads && createdLeads.length > 0) {
              const projectIds = [...new Set(createdLeads.map((l: any) => l.project_id).filter(Boolean))];
              if (projectIds.length > 0) {
                const { data: projectsData } = await supabase
                  .from('projects')
                  .select('name')
                  .in('id', projectIds);
                
                if (projectsData) {
                  projectsData.forEach((project: any) => {
                    if (project.name) {
                      projectNames.add(project.name);
                    }
                  });
                }
              }
            }
          } catch (error) {
            console.error('Error fetching created leads for session:', error);
          }
          
          return {
            ...session,
            projects_worked: Array.from(projectNames),
          };
        })
      );
      
      console.log('[getUserSessions] Returning', sessionsWithProjects.length, 'sessions with projects');
      return { data: sessionsWithProjects, error: null };
    }
    
    console.log('[getUserSessions] Returning', data?.length || 0, 'sessions');
    return { data: data || [], error: null };
  } catch (error) {
    console.error('[getUserSessions] Exception:', error);
    logSupabaseError('getUserSessions', error);
    return { data: [], error: error as any };
  }
};

export const getAllUserSessions = async (limit: number = 1000) => {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { data: [], error: { message: 'User not authenticated' } };
    }
    
    // Check if user is manager or owner
    const userRole = await getUserRole(currentUser.id);
    if (userRole !== 'manager' && userRole !== 'owner') {
      return { data: [], error: { message: 'Unauthorized' } };
    }
    
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*, users(id, full_name, email)')
      .order('login_time', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError('getAllUserSessions', error);
    return { data: [], error: error as any };
  }
};

// ============================================================================
// DEAL STAGES FUNCTIONS
// ============================================================================

export const getDealStages = async () => {
  try {
    const { data, error } = await supabase
      .from('deal_stages')
      .select('*')
      .order('order_index', { ascending: true });
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('getDealStages', error);
    return { data: null, error: error as any };
  }
};

export const createDealStage = async (stageData: { name: string; description?: string; order_index?: number; color?: string; created_by: string }) => {
  try {
    const { data, error } = await supabase
      .from('deal_stages')
      .insert([stageData])
      .select()
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('createDealStage', error);
    return { data: null, error: error as any };
  }
};

export const updateDealStage = async (id: string, updates: Partial<{ name: string; description: string; order_index: number; color: string; is_active: boolean }>) => {
  try {
    const { data, error } = await supabase
      .from('deal_stages')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('updateDealStage', error);
    return { data: null, error: error as any };
  }
};

export const deleteDealStage = async (id: string) => {
  try {
    const { error } = await supabase
      .from('deal_stages')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('deleteDealStage', error);
    return { error: error as any };
  }
};

// ============================================================================
// QUOTATIONS FUNCTIONS
// ============================================================================

export const getQuotations = async () => {
  try {
    const { data, error } = await supabase
      .from('quotations')
      .select('*, leads(company_name, contact_name), projects(name)')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('getQuotations', error);
    return { data: null, error: error as any };
  }
};

export const getQuotation = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('quotations')
      .select('*, quotation_items(*), leads(*), projects(*)')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('getQuotation', error);
    return { data: null, error: error as any };
  }
};

export const createQuotation = async (quotationData: any) => {
  try {
    const { quotation_items, ...quotation } = quotationData;
    
    const { data: quotationResult, error: quotationError } = await supabase
      .from('quotations')
      .insert([quotation])
      .select()
      .single();
    
    if (quotationError) throw quotationError;
    
    if (quotation_items && quotation_items.length > 0) {
      const items = quotation_items.map((item: any, index: number) => ({
        ...item,
        quotation_id: quotationResult.id,
        order_index: index,
      }));
      
      const { error: itemsError } = await supabase
        .from('quotation_items')
        .insert(items);
      
      if (itemsError) throw itemsError;
    }
    
    return { data: quotationResult, error: null };
  } catch (error) {
    logSupabaseError('createQuotation', error);
    return { data: null, error: error as any };
  }
};

export const updateQuotation = async (id: string, updates: any) => {
  try {
    const { quotation_items, ...quotation } = updates;
    
    const { data, error } = await supabase
      .from('quotations')
      .update(quotation)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    if (quotation_items !== undefined) {
      // Delete existing items
      await supabase.from('quotation_items').delete().eq('quotation_id', id);
      
      // Insert new items
      if (quotation_items.length > 0) {
        const items = quotation_items.map((item: any, index: number) => ({
          ...item,
          quotation_id: id,
          order_index: index,
        }));
        
        await supabase.from('quotation_items').insert(items);
      }
    }
    
    return { data, error: null };
  } catch (error) {
    logSupabaseError('updateQuotation', error);
    return { data: null, error: error as any };
  }
};

export const deleteQuotation = async (id: string) => {
  try {
    const { error } = await supabase
      .from('quotations')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('deleteQuotation', error);
    return { error: error as any };
  }
};

// ============================================================================
// INVOICES FUNCTIONS
// ============================================================================

export const getInvoices = async () => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, leads(company_name, contact_name), projects(name)')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('getInvoices', error);
    return { data: null, error: error as any };
  }
};

export const getInvoice = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, invoice_items(*), leads(*), projects(*)')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('getInvoice', error);
    return { data: null, error: error as any };
  }
};

export const createInvoice = async (invoiceData: any) => {
  try {
    const { invoice_items, ...invoice } = invoiceData;
    
    const { data: invoiceResult, error: invoiceError } = await supabase
      .from('invoices')
      .insert([invoice])
      .select()
      .single();
    
    if (invoiceError) throw invoiceError;
    
    if (invoice_items && invoice_items.length > 0) {
      const items = invoice_items.map((item: any, index: number) => ({
        ...item,
        invoice_id: invoiceResult.id,
        order_index: index,
      }));
      
      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(items);
      
      if (itemsError) throw itemsError;
    }
    
    return { data: invoiceResult, error: null };
  } catch (error) {
    logSupabaseError('createInvoice', error);
    return { data: null, error: error as any };
  }
};

export const updateInvoice = async (id: string, updates: any) => {
  try {
    const { invoice_items, ...invoice } = updates;
    
    const { data, error } = await supabase
      .from('invoices')
      .update(invoice)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    if (invoice_items !== undefined) {
      await supabase.from('invoice_items').delete().eq('invoice_id', id);
      
      if (invoice_items.length > 0) {
        const items = invoice_items.map((item: any, index: number) => ({
          ...item,
          invoice_id: id,
          order_index: index,
        }));
        
        await supabase.from('invoice_items').insert(items);
      }
    }
    
    return { data, error: null };
  } catch (error) {
    logSupabaseError('updateInvoice', error);
    return { data: null, error: error as any };
  }
};

export const deleteInvoice = async (id: string) => {
  try {
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('deleteInvoice', error);
    return { error: error as any };
  }
};

// ============================================================================
// RECEIPTS FUNCTIONS
// ============================================================================

export const getReceipts = async () => {
  try {
    const { data, error } = await supabase
      .from('receipts')
      .select('*, invoices(invoice_number, total_amount)')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('getReceipts', error);
    return { data: null, error: error as any };
  }
};

export const createReceipt = async (receiptData: any) => {
  try {
    const { data, error } = await supabase
      .from('receipts')
      .insert([receiptData])
      .select()
      .single();
    
    if (error) throw error;
    
    // Update invoice paid amount if invoice_id is provided
    if (receiptData.invoice_id) {
      const { data: invoice } = await getInvoice(receiptData.invoice_id);
      if (invoice) {
        const newPaidAmount = (invoice.paid_amount || 0) + receiptData.amount;
        const newStatus = newPaidAmount >= invoice.total_amount ? 'paid' : 
                         newPaidAmount > 0 ? 'partial' : 'pending';
        await updateInvoice(receiptData.invoice_id, { 
          paid_amount: newPaidAmount,
          status: newStatus 
        });
      }
    }
    
    return { data, error: null };
  } catch (error) {
    logSupabaseError('createReceipt', error);
    return { data: null, error: error as any };
  }
};

export const updateReceipt = async (id: string, updates: any) => {
  try {
    const { data, error } = await supabase
      .from('receipts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('updateReceipt', error);
    return { data: null, error: error as any };
  }
};

export const deleteReceipt = async (id: string) => {
  try {
    const { error } = await supabase
      .from('receipts')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('deleteReceipt', error);
    return { error: error as any };
  }
};

// ============================================================================
// SUPPLIERS FUNCTIONS
// ============================================================================

export const getSuppliers = async () => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('supplier_name', { ascending: true });
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('getSuppliers', error);
    return { data: null, error: error as any };
  }
};

export const getSupplier = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*, supplier_persons(*)')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('getSupplier', error);
    return { data: null, error: error as any };
  }
};

export const createSupplier = async (supplierData: any) => {
  try {
    const { supplier_persons, ...supplier } = supplierData;
    
    const { data: supplierResult, error: supplierError } = await supabase
      .from('suppliers')
      .insert([supplier])
      .select()
      .single();
    
    if (supplierError) throw supplierError;
    
    if (supplier_persons && supplier_persons.length > 0) {
      const persons = supplier_persons.map((person: any) => ({
        ...person,
        supplier_id: supplierResult.id,
      }));
      
      const { error: personsError } = await supabase
        .from('supplier_persons')
        .insert(persons);
      
      if (personsError) throw personsError;
    }
    
    return { data: supplierResult, error: null };
  } catch (error) {
    logSupabaseError('createSupplier', error);
    return { data: null, error: error as any };
  }
};

export const updateSupplier = async (id: string, updates: any) => {
  try {
    const { supplier_persons, ...supplier } = updates;
    
    const { data, error } = await supabase
      .from('suppliers')
      .update(supplier)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    if (supplier_persons !== undefined) {
      await supabase.from('supplier_persons').delete().eq('supplier_id', id);
      
      if (supplier_persons.length > 0) {
        const persons = supplier_persons.map((person: any) => ({
          ...person,
          supplier_id: id,
        }));
        
        await supabase.from('supplier_persons').insert(persons);
      }
    }
    
    return { data, error: null };
  } catch (error) {
    logSupabaseError('updateSupplier', error);
    return { data: null, error: error as any };
  }
};

export const deleteSupplier = async (id: string) => {
  try {
    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('deleteSupplier', error);
    return { error: error as any };
  }
};

// ============================================================================
// PURCHASE ORDERS FUNCTIONS
// ============================================================================

export const getPurchaseOrders = async () => {
  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, suppliers(supplier_name), projects(name)')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('getPurchaseOrders', error);
    return { data: null, error: error as any };
  }
};

export const getPurchaseOrder = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, purchase_order_items(*), suppliers(*), projects(*)')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('getPurchaseOrder', error);
    return { data: null, error: error as any };
  }
};

export const createPurchaseOrder = async (poData: any) => {
  try {
    const { purchase_order_items, ...purchaseOrder } = poData;
    
    const { data: poResult, error: poError } = await supabase
      .from('purchase_orders')
      .insert([purchaseOrder])
      .select()
      .single();
    
    if (poError) throw poError;
    
    if (purchase_order_items && purchase_order_items.length > 0) {
      const items = purchase_order_items.map((item: any, index: number) => ({
        ...item,
        purchase_order_id: poResult.id,
        order_index: index,
      }));
      
      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(items);
      
      if (itemsError) throw itemsError;
    }
    
    return { data: poResult, error: null };
  } catch (error) {
    logSupabaseError('createPurchaseOrder', error);
    return { data: null, error: error as any };
  }
};

export const updatePurchaseOrder = async (id: string, updates: any) => {
  try {
    const { purchase_order_items, ...purchaseOrder } = updates;
    
    const { data, error } = await supabase
      .from('purchase_orders')
      .update(purchaseOrder)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    if (purchase_order_items !== undefined) {
      await supabase.from('purchase_order_items').delete().eq('purchase_order_id', id);
      
      if (purchase_order_items.length > 0) {
        const items = purchase_order_items.map((item: any, index: number) => ({
          ...item,
          purchase_order_id: id,
          order_index: index,
        }));
        
        await supabase.from('purchase_order_items').insert(items);
      }
    }
    
    return { data, error: null };
  } catch (error) {
    logSupabaseError('updatePurchaseOrder', error);
    return { data: null, error: error as any };
  }
};

export const deletePurchaseOrder = async (id: string) => {
  try {
    const { error } = await supabase
      .from('purchase_orders')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('deletePurchaseOrder', error);
    return { error: error as any };
  }
};

// ═══════════════════════════════════════════════════════════════
// Saved searches, static lists, and outreach sequences
//
// A SEGMENT is a live query — it re-evaluates every time you apply it.
// A LIST is frozen membership — you curated it once and it stays put.
// Keeping them distinct means "why did this lead disappear from my
// list?" always has an answer.
// ═══════════════════════════════════════════════════════════════

export interface LeadSegment {
  id: string;
  name: string;
  description?: string | null;
  project_id?: string | null;
  filters: Record<string, any>;
  targeting: Record<string, any>;
  is_shared: boolean;
  created_by?: string | null;
  created_at: string;
  last_used_at?: string | null;
}

export const getLeadSegments = async () => {
  try {
    const { data, error } = await supabase
      .from('lead_segments')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { data: (data || []) as LeadSegment[], error: null };
  } catch (error) {
    logSupabaseError('getLeadSegments', error);
    return { data: [] as LeadSegment[], error: error as any };
  }
};

export const createLeadSegment = async (segment: {
  name: string;
  description?: string | null;
  project_id?: string | null;
  filters?: Record<string, any>;
  targeting?: Record<string, any>;
}) => {
  try {
    const user = await getCurrentUser();
    const { data, error } = await supabase
      .from('lead_segments')
      .insert({
        name: segment.name,
        description: segment.description || null,
        project_id: segment.project_id || null,
        filters: segment.filters || {},
        targeting: segment.targeting || {},
        created_by: user?.id || null,
      })
      .select()
      .single();
    if (error) throw error;
    return { data: data as LeadSegment, error: null };
  } catch (error) {
    logSupabaseError('createLeadSegment', error);
    return { data: null, error: error as any };
  }
};

export const updateLeadSegment = async (id: string, patch: Partial<LeadSegment>) => {
  try {
    const { data, error } = await supabase
      .from('lead_segments')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return { data: data as LeadSegment, error: null };
  } catch (error) {
    logSupabaseError('updateLeadSegment', error);
    return { data: null, error: error as any };
  }
};

export const deleteLeadSegment = async (id: string) => {
  try {
    const { error } = await supabase.from('lead_segments').delete().eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('deleteLeadSegment', error);
    return { error: error as any };
  }
};

export const touchSegment = (id: string) =>
  supabase
    .from('lead_segments')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', id)
    .then(() => {}, () => {});

// ── Static lists ───────────────────────────────────────────────

export const getStaticLists = async () => {
  try {
    const { data, error } = await supabase
      .from('static_lists')
      .select('*, static_list_members(lead_id)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return {
      data: (data || []).map((l: any) => ({
        ...l,
        member_count: l.static_list_members?.length ?? 0,
        member_ids: (l.static_list_members || []).map((m: any) => m.lead_id),
      })),
      error: null,
    };
  } catch (error) {
    logSupabaseError('getStaticLists', error);
    return { data: [] as any[], error: error as any };
  }
};

export const createStaticList = async (list: {
  name: string;
  description?: string | null;
  project_id?: string | null;
  leadIds?: string[];
}) => {
  try {
    const user = await getCurrentUser();
    const { data, error } = await supabase
      .from('static_lists')
      .insert({
        name: list.name,
        description: list.description || null,
        project_id: list.project_id || null,
        created_by: user?.id || null,
      })
      .select()
      .single();
    if (error) throw error;

    if (list.leadIds?.length) {
      await addLeadsToList(data.id, list.leadIds);
    }
    return { data, error: null };
  } catch (error) {
    logSupabaseError('createStaticList', error);
    return { data: null, error: error as any };
  }
};

export const addLeadsToList = async (listId: string, leadIds: string[]) => {
  try {
    const user = await getCurrentUser();
    // upsert so re-adding an existing member is a no-op rather than an error
    const { error } = await supabase.from('static_list_members').upsert(
      leadIds.map((lead_id) => ({
        list_id: listId,
        lead_id,
        added_by: user?.id || null,
      })),
      { onConflict: 'list_id,lead_id', ignoreDuplicates: true }
    );
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('addLeadsToList', error);
    return { error: error as any };
  }
};

export const removeLeadFromList = async (listId: string, leadId: string) => {
  try {
    const { error } = await supabase
      .from('static_list_members')
      .delete()
      .eq('list_id', listId)
      .eq('lead_id', leadId);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('removeLeadFromList', error);
    return { error: error as any };
  }
};

export const deleteStaticList = async (id: string) => {
  try {
    const { error } = await supabase.from('static_lists').delete().eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('deleteStaticList', error);
    return { error: error as any };
  }
};

// ── Sequences ──────────────────────────────────────────────────

export const getSequences = async () => {
  try {
    const { data, error } = await supabase
      .from('sequences')
      .select('*, sequence_steps(*), sequence_enrollments(id, status)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return {
      data: (data || []).map((s: any) => ({
        ...s,
        steps: (s.sequence_steps || []).sort(
          (a: any, b: any) => a.step_order - b.step_order
        ),
        active_count: (s.sequence_enrollments || []).filter(
          (e: any) => e.status === 'active'
        ).length,
        total_enrolled: (s.sequence_enrollments || []).length,
      })),
      error: null,
    };
  } catch (error) {
    logSupabaseError('getSequences', error);
    return { data: [] as any[], error: error as any };
  }
};

export const createSequence = async (seq: {
  name: string;
  description?: string | null;
  project_id?: string | null;
  stop_on_reply?: boolean;
  steps: Array<{
    step_type: string;
    wait_days: number;
    subject?: string | null;
    body?: string | null;
    config?: Record<string, any>;
  }>;
}) => {
  try {
    const user = await getCurrentUser();
    const { data, error } = await supabase
      .from('sequences')
      .insert({
        name: seq.name,
        description: seq.description || null,
        project_id: seq.project_id || null,
        stop_on_reply: seq.stop_on_reply ?? true,
        created_by: user?.id || null,
      })
      .select()
      .single();
    if (error) throw error;

    if (seq.steps?.length) {
      const { error: stepErr } = await supabase.from('sequence_steps').insert(
        seq.steps.map((s, i) => ({
          sequence_id: data.id,
          step_order: i + 1,
          step_type: s.step_type,
          wait_days: Number(s.wait_days) || 0,
          subject: s.subject || null,
          body: s.body || null,
          config: s.config || {},
        }))
      );
      if (stepErr) throw stepErr;
    }
    return { data, error: null };
  } catch (error) {
    logSupabaseError('createSequence', error);
    return { data: null, error: error as any };
  }
};

export const deleteSequence = async (id: string) => {
  try {
    const { error } = await supabase.from('sequences').delete().eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('deleteSequence', error);
    return { error: error as any };
  }
};

export const setSequenceEnabled = async (id: string, enabled: boolean) => {
  try {
    const { error } = await supabase.from('sequences').update({ enabled }).eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('setSequenceEnabled', error);
    return { error: error as any };
  }
};

/** Enrol leads. Already-enrolled leads are skipped, not duplicated. */
export const enrollLeadsInSequence = async (sequenceId: string, leadIds: string[]) => {
  try {
    const user = await getCurrentUser();

    const { data: firstStep } = await supabase
      .from('sequence_steps')
      .select('wait_days')
      .eq('sequence_id', sequenceId)
      .eq('step_order', 1)
      .maybeSingle();

    if (!firstStep) {
      throw new Error('This sequence has no steps yet, so there is nothing to enrol into.');
    }

    const start = new Date();
    start.setDate(start.getDate() + (Number(firstStep.wait_days) || 0));

    const { data, error } = await supabase
      .from('sequence_enrollments')
      .upsert(
        leadIds.map((lead_id) => ({
          sequence_id: sequenceId,
          lead_id,
          status: 'active',
          current_step: 0,
          next_action_at: start.toISOString(),
          enrolled_by: user?.id || null,
        })),
        { onConflict: 'sequence_id,lead_id', ignoreDuplicates: true }
      )
      .select();

    if (error) throw error;
    return { data: data || [], enrolled: (data || []).length, error: null };
  } catch (error) {
    logSupabaseError('enrollLeadsInSequence', error);
    return { data: [], enrolled: 0, error: error as any };
  }
};

export const getMySequenceTasks = async (userId?: string) => {
  try {
    let q = supabase
      .from('sequence_tasks')
      .select('*, leads(id, company_name, contact_name, phone, email, status)')
      .is('completed_at', null)
      .order('due_at', { ascending: true });

    if (userId) q = q.eq('assigned_to', userId);

    const { data, error } = await q.limit(200);
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError('getMySequenceTasks', error);
    return { data: [] as any[], error: error as any };
  }
};

export const completeSequenceTask = async (taskId: string, skipped = false) => {
  try {
    const user = await getCurrentUser();
    const { error } = await supabase
      .from('sequence_tasks')
      .update({
        completed_at: new Date().toISOString(),
        completed_by: user?.id || null,
        skipped,
      })
      .eq('id', taskId);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    logSupabaseError('completeSequenceTask', error);
    return { error: error as any };
  }
};
