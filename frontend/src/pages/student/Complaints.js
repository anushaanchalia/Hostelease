import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select';
import api from '../../utils/api';
import { getUser } from '../../utils/auth';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Upload,
  X,
  Image as ImageIcon,
  FileText,
  Filter,
  ArrowUpDown,
  Eye,
  RotateCcw,
  Clock3,
  UserRound
} from 'lucide-react';

const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000';

const normalizeHostel = (name = '') => {
  const cleaned = String(name).trim();
  if (!cleaned) return 'N/A';
  if (cleaned.toLowerCase() === 'shakunthala bhawan') return 'Shakuntala Bhawan';
  return cleaned;
};

const getStatusClass = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'resolved':
      return 'bg-green-100 text-green-700';
    case 'in_progress':
      return 'bg-blue-100 text-blue-700';
    case 'rejected':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-yellow-100 text-yellow-700';
  }
};

const getPriorityClass = (priority) => {
  switch ((priority || '').toLowerCase()) {
    case 'urgent':
      return 'bg-red-100 text-red-700';
    case 'high':
      return 'bg-orange-100 text-orange-700';
    case 'medium':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};

export default function Complaints() {
  const [complaints, setComplaints] = useState([]);
  const [category, setCategory] = useState('electricity');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [historyCategory, setHistoryCategory] = useState('all');
  const [historyStatus, setHistoryStatus] = useState('all');
  const [sortOrder, setSortOrder] = useState('latest');
  const [reopenReason, setReopenReason] = useState({});
  const fileInputRef = useRef(null);

  const user = getUser();

  useEffect(() => {
    loadComplaints();
  }, []);

  const loadComplaints = async () => {
    try {
      const response = await api.get('/complaints');
      const normalized = Array.isArray(response.data)
        ? response.data.map((item) => ({
            ...item,
            hostel_name: normalizeHostel(item.hostel_name || item.hostel),
            status: (item.status || 'pending').toLowerCase(),
            priority: (item.priority || 'medium').toLowerCase(),
            status_history: item.status_history || []
          }))
        : [];
      setComplaints(normalized);
    } catch (error) {
      console.error('Error loading complaints:', error);
      toast.error('Failed to load complaints');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('File too large. Maximum size is 5MB.');
      return;
    }

    setSelectedFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const removeFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!category) {
      toast.error('Complaint category is required');
      return;
    }

    if (!priority) {
      toast.error('Priority is required');
      return;
    }

    if (!description.trim()) {
      toast.error('Description is required');
      return;
    }

    if (description.trim().length < 10) {
      toast.error('Description must be at least 10 characters');
      return;
    }

    if (!selectedFile) {
      toast.error('Complaint image is required');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('category', category);
      formData.append('description', description.trim());
      formData.append('priority', priority);
      formData.append('image', selectedFile);

      await api.post('/complaints', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Complaint submitted successfully');
      setDescription('');
      setCategory('electricity');
      setPriority('medium');
      removeFile();
      setShowForm(false);
      await loadComplaints();
    } catch (error) {
      console.error('Submission Error:', error);
      toast.error(error.response?.data?.detail || 'Failed to submit complaint');
    } finally {
      setLoading(false);
    }
  };

  const handleReopenComplaint = async (complaintId) => {
    const reason = (reopenReason[complaintId] || '').trim();
    if (!reason) {
      toast.error('Please enter reason to reopen complaint');
      return;
    }

    try {
      await api.post(`/complaints/${complaintId}/reopen`, { reason });
      toast.success('Complaint reopened successfully');
      setReopenReason((prev) => ({ ...prev, [complaintId]: '' }));
      await loadComplaints();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || 'Failed to reopen complaint');
    }
  };

  const filteredComplaints = useMemo(() => {
    let data = [...complaints];

    data = data.filter((item) => {
      const matchCategory = historyCategory === 'all' || (item.category || '').toLowerCase() === historyCategory;
      const matchStatus = historyStatus === 'all' || (item.status || '').toLowerCase() === historyStatus;
      return matchCategory && matchStatus;
    });

    data.sort((a, b) => {
      const aTime = new Date(a.date || 0).getTime();
      const bTime = new Date(b.date || 0).getTime();
      return sortOrder === 'latest' ? bTime - aTime : aTime - bTime;
    });

    return data;
  }, [complaints, historyCategory, historyStatus, sortOrder]);

  return (
    <div className="space-y-6 fade-in" data-testid="complaints-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle size={32} className="text-[#5B7FED]" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Complaints
            </h1>
            <p className="text-slate-500 text-sm mt-1">Raise and track your complaints</p>
          </div>
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#5B7FED] hover:bg-[#4A6FD6] text-white"
        >
          {showForm ? 'View Complaints' : 'Raise Complaint'}
        </Button>
      </div>

      {showForm ? (
        <Card className="p-6 bg-white rounded-xl shadow-sm max-w-2xl">
          <h2 className="text-xl font-semibold mb-6">Raise New Complaint</h2>

          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Fields marked with <span className="font-bold">*</span> are compulsory.
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label className="text-slate-700 font-medium">
                Complaint Category <span className="text-red-500">*</span>
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="electricity">Electricity</SelectItem>
                  <SelectItem value="washroom">Washroom</SelectItem>
                  <SelectItem value="cleaning">Cleaning</SelectItem>
                  <SelectItem value="other">Other Room Issues</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-700 font-medium">
                Priority <span className="text-red-500">*</span>
              </Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-700 font-medium">
                Description <span className="text-red-500">*</span>
              </Label>
              <Textarea
                placeholder="Explain the issue briefly (10-1000 characters)..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-32 mt-1"
                maxLength={1000}
                required
              />
              <p className="text-xs text-slate-500 mt-1">{description.length}/1000 characters</p>
            </div>

            <div>
              <Label className="text-slate-700 font-medium">
                Upload Image <span className="text-red-500">*</span>
              </Label>
              <p className="text-xs text-slate-500 mb-2">
                Required | Max size: 5MB | Allowed: JPEG, PNG, GIF, WebP
              </p>

              {!previewUrl ? (
                <div
                  className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-[#5B7FED] transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mx-auto text-slate-400 mb-2" size={32} />
                  <p className="text-slate-600 mb-1">Click to upload complaint image</p>
                  <p className="text-xs text-slate-500">This field is mandatory</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="relative border border-slate-200 rounded-lg p-4">
                  <button
                    type="button"
                    onClick={removeFile}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                  >
                    <X size={16} />
                  </button>
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 rounded-lg overflow-hidden bg-slate-100">
                      <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{selectedFile?.name}</p>
                      <p className="text-sm text-slate-500">{(selectedFile?.size / 1024).toFixed(2)} KB</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-red-500 hover:bg-red-600 text-white py-3 font-medium"
            >
              {loading ? 'Submitting...' : 'Submit Complaint'}
            </Button>
          </form>
        </Card>
      ) : (
        <div>
          <Card className="mb-6 p-4 bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <ImageIcon className="text-blue-600 mt-1" size={20} />
              <div className="text-sm text-slate-700">
                <p className="font-medium text-blue-900 mb-1">Your Complaint History</p>
                <p>Track all your submitted complaints, notes, and status changes below.</p>
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap gap-3 mb-4">
            <div className="min-w-[180px]">
              <Select value={historyCategory} onValueChange={setHistoryCategory}>
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <Filter size={14} />
                    <SelectValue placeholder="Filter Category" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="electricity">Electricity</SelectItem>
                  <SelectItem value="washroom">Washroom</SelectItem>
                  <SelectItem value="cleaning">Cleaning</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[180px]">
              <Select value={historyStatus} onValueChange={setHistoryStatus}>
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <Filter size={14} />
                    <SelectValue placeholder="Filter Status" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setSortOrder((prev) => (prev === 'latest' ? 'oldest' : 'latest'))}
              className="gap-2"
            >
              <ArrowUpDown size={14} />
              {sortOrder === 'latest' ? 'Latest First' : 'Oldest First'}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredComplaints.length === 0 ? (
              <Card className="p-12 text-center bg-white rounded-xl shadow-sm">
                <AlertTriangle className="mx-auto text-slate-300 mb-3" size={48} />
                <p className="text-slate-500">No complaints found for selected filters</p>
              </Card>
            ) : (
              filteredComplaints.map((complaint) => (
                <Card key={complaint._id} className="p-6 bg-white rounded-xl shadow-sm hover-lift">
                  <div className="flex justify-between items-start mb-4 gap-4">
                    <div className="flex-1">
                      <div className="flex items-center flex-wrap gap-2 mb-2">
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                          {complaint.complaint_code || 'N/A'}
                        </span>
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 capitalize">
                          {complaint.category}
                        </span>
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium capitalize ${getPriorityClass(complaint.priority)}`}>
                          {complaint.priority || 'medium'}
                        </span>
                        <span className="text-sm text-slate-500">•</span>
                        <span className="text-sm text-slate-600">
                          {complaint.date ? new Date(complaint.date).toLocaleString() : 'N/A'}
                        </span>
                      </div>

                      <p className="text-slate-900 mb-3">{complaint.description}</p>

                      <div className="text-xs text-slate-500 mb-2">
                        Residence: {normalizeHostel(complaint.hostel_name || user?.hostel_name)} | Block: {complaint.block || user?.block || 'N/A'} | Room: {complaint.room_number || user?.room_number || 'N/A'} | Bed: {complaint.bed_number || user?.bed_number || 'N/A'}
                      </div>

                      {complaint.assigned_to && (
                        <div className="flex items-center gap-2 text-xs text-blue-700 font-medium mb-2">
                          <UserRound size={13} />
                          Assigned to: {complaint.assigned_to}
                        </div>
                      )}

                      {complaint.resolution_note && (
                        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-2">
                          <strong>Resolution Note:</strong> {complaint.resolution_note}
                        </div>
                      )}

                      {complaint.admin_note && (
                        <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-3 mb-2">
                          <strong>Admin Note:</strong> {complaint.admin_note}
                        </div>
                      )}

                      {complaint.status_history?.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-slate-700 mb-2">Status History</p>
                          <div className="space-y-2">
                            {complaint.status_history.slice().reverse().map((entry, idx) => (
                              <div key={idx} className="text-xs text-slate-600 flex items-start gap-2">
                                <Clock3 size={12} className="mt-0.5 text-slate-400" />
                                <div>
                                  <span className="font-semibold capitalize">{entry.status?.replace('_', ' ')}</span>
                                  {' '}• {entry.changed_at ? new Date(entry.changed_at).toLocaleString() : 'N/A'}
                                  {entry.note ? <div className="text-slate-500">{entry.note}</div> : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-3 mt-4">
                        {complaint.image_url && (
                          <button
                            className="inline-flex items-center gap-2 text-sm text-[#5B7FED] font-medium hover:underline"
                            onClick={() => window.open(`${backendUrl}${complaint.image_url}`, '_blank')}
                          >
                            <Eye size={14} />
                            View Image
                          </button>
                        )}

                        {complaint.pdf_url && (
                          <button
                            className="inline-flex items-center gap-2 text-sm text-slate-700 font-medium hover:underline"
                            onClick={() => window.open(`${backendUrl}${complaint.pdf_url}`, '_blank')}
                          >
                            <FileText size={14} />
                            View Record
                          </button>
                        )}
                      </div>

                      {(complaint.status === 'resolved' || complaint.status === 'rejected') && (
                        <div className="mt-4 border-t pt-4">
                          <Label className="text-sm text-slate-700 font-medium">Reason to Reopen</Label>
                          <Textarea
                            value={reopenReason[complaint._id] || ''}
                            onChange={(e) =>
                              setReopenReason((prev) => ({ ...prev, [complaint._id]: e.target.value }))
                            }
                            placeholder="Explain why this complaint should be reopened..."
                            className="mt-2 min-h-[90px]"
                          />
                          <Button
                            type="button"
                            onClick={() => handleReopenComplaint(complaint._id)}
                            className="mt-3 bg-slate-900 hover:bg-slate-800 text-white gap-2"
                          >
                            <RotateCcw size={14} />
                            Reopen Complaint
                          </Button>
                        </div>
                      )}
                    </div>

                    <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-4 capitalize ${getStatusClass(complaint.status)}`}>
                      {complaint.status === 'pending'
                        ? '⏳ Pending'
                        : complaint.status === 'in_progress'
                        ? '🛠 In Progress'
                        : complaint.status === 'rejected'
                        ? '✕ Rejected'
                        : '✓ Resolved'}
                    </span>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}