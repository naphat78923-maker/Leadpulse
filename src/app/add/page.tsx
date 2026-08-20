'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lead, LeadStage, Priority, ProductInterest, CustomerSize, DealPotential, STAGE_LABELS } from '@/types/lead';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';

const defaultForm = {
  client_name: '',
  type: '',
  priority: 'medium' as Priority,
  next_action: '',
  next_followup_date: '',
  latest_contact_date: '',
  product_interest: 'butter' as ProductInterest,
  contact_person: '',
  role: '',
  contact_email: '',
  contact_phone: '',
  contact_line: '',
  decision_maker: false,
  deal_potential: 'medium' as DealPotential,
  customer_size: 'B' as CustomerSize,
  notes: '',
  contact_source: '',
  sample_delivery_address: '',
  owner: 'Pat',
};

export default function AddLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState(defaultForm);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      router.push('/');
    }, 1500);
  };

  if (submitted) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 bg-clay-mint/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Save className="w-8 h-8 text-clay-teal" />
          </div>
          <h2 className="text-xl font-bold text-clay-ink mb-2">Lead Added!</h2>
          <p className="text-sm text-clay-muted">Redirecting to Today view...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/" className="p-2 hover:bg-clay-surface rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-clay-muted" />
        </Link>
        <div>
          <h1 className="text-3xl font-semibold text-clay-ink tracking-tight">Add New Lead</h1>
          <p className="text-sm text-clay-muted mt-1">Capture a new prospect for VG Saveur</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <section className="bg-white rounded-xl border border-clay-hairline p-6">
          <h2 className="text-base font-semibold text-clay-ink mb-4">Basic Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">Client Name *</label>
              <input
                type="text"
                name="client_name"
                value={form.client_name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none"
                placeholder="e.g., April's Bakery"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">Type</label>
              <input
                type="text"
                name="type"
                value={form.type}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none"
                placeholder="e.g., Bakery chain, Hotel, Restaurant"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">Priority</label>
              <select
                name="priority"
                value={form.priority}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">Customer Size</label>
              <select
                name="customer_size"
                value={form.customer_size}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none"
              >
                <option value="A">A — Large (multi-branch, hotel, manufacturer)</option>
                <option value="B">B — Medium (single location, growing)</option>
                <option value="C">C — Small (single location, limited volume)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">Deal Potential</label>
              <select
                name="deal_potential"
                value={form.deal_potential}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">Product Interest</label>
              <select
                name="product_interest"
                value={form.product_interest}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none"
              >
                <option value="butter">Butter</option>
                <option value="condensed_milk">Condensed Milk</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">Owner</label>
              <select
                name="owner"
                value={form.owner}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none"
              >
                <option value="Pat">Pat</option>
                <option value="Ebimaru-san">Ebimaru-san</option>
                <option value="Mint">Mint</option>
                <option value="OpenClaw">OpenClaw</option>
                <option value="Self">Self</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">Contact Source</label>
              <input
                type="text"
                name="contact_source"
                value={form.contact_source}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none"
                placeholder="e.g., Official homepage, Web search, Referral"
              />
            </div>
          </div>
        </section>

        {/* Contact Info */}
        <section className="bg-white rounded-xl border border-clay-hairline p-6">
          <h2 className="text-base font-semibold text-clay-ink mb-4">Contact Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">Contact Person</label>
              <input
                type="text"
                name="contact_person"
                value={form.contact_person}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none"
                placeholder="Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">Role</label>
              <input
                type="text"
                name="role"
                value={form.role}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none"
                placeholder="e.g., Owner, Purchasing, R&D"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">Email</label>
              <input
                type="email"
                name="contact_email"
                value={form.contact_email}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none"
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">Phone</label>
              <input
                type="tel"
                name="contact_phone"
                value={form.contact_phone}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none"
                placeholder="Phone number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">LINE ID</label>
              <input
                type="text"
                name="contact_line"
                value={form.contact_line}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none"
                placeholder="@lineid"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                name="decision_maker"
                id="decision_maker"
                checked={form.decision_maker}
                onChange={handleChange}
                className="w-4 h-4 text-clay-ink border-clay-hairline rounded focus:ring-clay-ink"
              />
              <label htmlFor="decision_maker" className="text-sm text-clay-body">
                This person is a decision maker
              </label>
            </div>
          </div>
        </section>

        {/* Follow-up */}
        <section className="bg-white rounded-xl border border-clay-hairline p-6">
          <h2 className="text-base font-semibold text-clay-ink mb-4">Follow-up & Action</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">Next Action</label>
              <textarea
                name="next_action"
                value={form.next_action}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none resize-none"
                placeholder="What needs to happen next?"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">Notes</label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none resize-none"
                placeholder="Context, research notes, fit assessment..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">Next Follow-up Date</label>
              <input
                type="date"
                name="next_followup_date"
                value={form.next_followup_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-clay-body mb-1">Latest Contact Date</label>
              <input
                type="date"
                name="latest_contact_date"
                value={form.latest_contact_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-clay-body mb-1">Sample Delivery Address</label>
              <input
                type="text"
                name="sample_delivery_address"
                value={form.sample_delivery_address}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-sm focus:ring-2 focus:ring-clay-ink focus:border-clay-ink outline-none"
                placeholder="Full address for sample delivery"
              />
            </div>
          </div>
        </section>

        {/* Submit */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-3 bg-clay-ink text-white font-medium rounded-lg hover:bg-clay-ink-light transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Lead
          </button>
          <Link
            href="/"
            className="px-6 py-3 bg-clay-card text-clay-ink font-medium rounded-lg hover:bg-clay-surface transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
