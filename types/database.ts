export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      branches: {
        Row: {
          color: string;
          created_at: string;
          created_by: string | null;
          id: string;
          lineage: Database["public"]["Enums"]["branch_lineage"];
          name: string;
          root_person_id: string;
          space_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          color: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          lineage?: Database["public"]["Enums"]["branch_lineage"];
          name: string;
          root_person_id: string;
          space_id: string;
          updated_at?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          lineage?: Database["public"]["Enums"]["branch_lineage"];
          name?: string;
          root_person_id?: string;
          space_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branches_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branches_space_id_root_person_id_fkey";
            columns: ["space_id", "root_person_id"];
            isOneToOne: false;
            referencedRelation: "persons";
            referencedColumns: ["space_id", "id"];
          },
        ];
      };
      change_log: {
        Row: {
          actor_user_id: string | null;
          after: Json | null;
          at: string;
          before: Json | null;
          id: number;
          op: Database["public"]["Enums"]["change_op"];
          operation: string | null;
          row_id: string | null;
          space_id: string;
          submission_id: string | null;
          table_name: string;
          txid: number;
        };
        ComputedFields: never;
        Insert: {
          actor_user_id?: string | null;
          after?: Json | null;
          at?: string;
          before?: Json | null;
          id?: never;
          op: Database["public"]["Enums"]["change_op"];
          operation?: string | null;
          row_id?: string | null;
          space_id: string;
          submission_id?: string | null;
          table_name: string;
          txid?: number;
        };
        Update: {
          actor_user_id?: string | null;
          after?: Json | null;
          at?: string;
          before?: Json | null;
          id?: never;
          op?: Database["public"]["Enums"]["change_op"];
          operation?: string | null;
          row_id?: string | null;
          space_id?: string;
          submission_id?: string | null;
          table_name?: string;
          txid?: number;
        };
        Relationships: [];
      };
      claim_requests: {
        Row: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          note: string | null;
          person_id: string;
          space_id: string;
          status: Database["public"]["Enums"]["decision_status"];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          note?: string | null;
          person_id: string;
          space_id: string;
          status?: Database["public"]["Enums"]["decision_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          note?: string | null;
          person_id?: string;
          space_id?: string;
          status?: Database["public"]["Enums"]["decision_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "claim_requests_space_id_person_id_fkey";
            columns: ["space_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "persons";
            referencedColumns: ["space_id", "id"];
          },
        ];
      };
      form_links: {
        Row: {
          anchor_person_id: string | null;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          label: string;
          max_submissions: number | null;
          message_template: string | null;
          require_verification: boolean;
          space_id: string;
          status: Database["public"]["Enums"]["form_link_status"];
          token: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          anchor_person_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          label: string;
          max_submissions?: number | null;
          message_template?: string | null;
          require_verification?: boolean;
          space_id: string;
          status?: Database["public"]["Enums"]["form_link_status"];
          token?: string;
          updated_at?: string;
        };
        Update: {
          anchor_person_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          label?: string;
          max_submissions?: number | null;
          message_template?: string | null;
          require_verification?: boolean;
          space_id?: string;
          status?: Database["public"]["Enums"]["form_link_status"];
          token?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "form_links_space_id_anchor_person_id_fkey";
            columns: ["space_id", "anchor_person_id"];
            isOneToOne: false;
            referencedRelation: "persons";
            referencedColumns: ["space_id", "id"];
          },
          {
            foreignKeyName: "form_links_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      identities: {
        Row: {
          created_at: string;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
        };
        Relationships: [];
      };
      invites: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string | null;
          expires_at: string;
          id: string;
          invited_by: string | null;
          person_id: string | null;
          phone: string | null;
          role: Database["public"]["Enums"]["member_role"];
          space_id: string;
          status: Database["public"]["Enums"]["invite_status"];
          token: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string | null;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          person_id?: string | null;
          phone?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          space_id: string;
          status?: Database["public"]["Enums"]["invite_status"];
          token?: string;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string | null;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          person_id?: string | null;
          phone?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          space_id?: string;
          status?: Database["public"]["Enums"]["invite_status"];
          token?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invites_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_space_id_person_id_fkey";
            columns: ["space_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "persons";
            referencedColumns: ["space_id", "id"];
          },
        ];
      };
      media: {
        Row: {
          caption: string | null;
          created_at: string;
          deleted_at: string | null;
          id: string;
          space_id: string;
          storage_path: string;
          taken_date: string | null;
          taken_precision: Database["public"]["Enums"]["date_precision"];
          updated_at: string;
          uploaded_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          caption?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          space_id: string;
          storage_path: string;
          taken_date?: string | null;
          taken_precision?: Database["public"]["Enums"]["date_precision"];
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          caption?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          space_id?: string;
          storage_path?: string;
          taken_date?: string | null;
          taken_precision?: Database["public"]["Enums"]["date_precision"];
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "media_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      media_people: {
        Row: {
          created_at: string;
          created_by: string | null;
          media_id: string;
          person_id: string;
          space_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          media_id: string;
          person_id: string;
          space_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          media_id?: string;
          person_id?: string;
          space_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "media_people_space_id_media_id_fkey";
            columns: ["space_id", "media_id"];
            isOneToOne: false;
            referencedRelation: "media";
            referencedColumns: ["space_id", "id"];
          },
          {
            foreignKeyName: "media_people_space_id_person_id_fkey";
            columns: ["space_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "persons";
            referencedColumns: ["space_id", "id"];
          },
        ];
      };
      parent_child: {
        Row: {
          child_id: string;
          created_at: string;
          created_by: string | null;
          end_date: string | null;
          id: string;
          kind: Database["public"]["Enums"]["parent_child_kind"];
          parent_id: string;
          space_id: string;
          start_date: string | null;
          union_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          child_id: string;
          created_at?: string;
          created_by?: string | null;
          end_date?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["parent_child_kind"];
          parent_id: string;
          space_id: string;
          start_date?: string | null;
          union_id?: string | null;
          updated_at?: string;
        };
        Update: {
          child_id?: string;
          created_at?: string;
          created_by?: string | null;
          end_date?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["parent_child_kind"];
          parent_id?: string;
          space_id?: string;
          start_date?: string | null;
          union_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "parent_child_space_id_child_id_fkey";
            columns: ["space_id", "child_id"];
            isOneToOne: false;
            referencedRelation: "persons";
            referencedColumns: ["space_id", "id"];
          },
          {
            foreignKeyName: "parent_child_space_id_parent_id_fkey";
            columns: ["space_id", "parent_id"];
            isOneToOne: false;
            referencedRelation: "persons";
            referencedColumns: ["space_id", "id"];
          },
          {
            foreignKeyName: "parent_child_space_id_union_id_fkey";
            columns: ["space_id", "union_id"];
            isOneToOne: false;
            referencedRelation: "unions";
            referencedColumns: ["space_id", "id"];
          },
        ];
      };
      person_links: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          person_id: string;
          platform: Database["public"]["Enums"]["link_platform"];
          space_id: string;
          updated_at: string;
          url: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          person_id: string;
          platform: Database["public"]["Enums"]["link_platform"];
          space_id: string;
          updated_at?: string;
          url: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          person_id?: string;
          platform?: Database["public"]["Enums"]["link_platform"];
          space_id?: string;
          updated_at?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "person_links_space_id_person_id_fkey";
            columns: ["space_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "persons";
            referencedColumns: ["space_id", "id"];
          },
        ];
      };
      person_names: {
        Row: {
          created_at: string;
          created_by: string | null;
          family: string | null;
          given: string | null;
          id: string;
          is_primary: boolean;
          kind: Database["public"]["Enums"]["name_kind"];
          person_id: string;
          script: string | null;
          space_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          family?: string | null;
          given?: string | null;
          id?: string;
          is_primary?: boolean;
          kind: Database["public"]["Enums"]["name_kind"];
          person_id: string;
          script?: string | null;
          space_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          family?: string | null;
          given?: string | null;
          id?: string;
          is_primary?: boolean;
          kind?: Database["public"]["Enums"]["name_kind"];
          person_id?: string;
          script?: string | null;
          space_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "person_names_space_id_person_id_fkey";
            columns: ["space_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "persons";
            referencedColumns: ["space_id", "id"];
          },
        ];
      };
      person_places: {
        Row: {
          created_at: string;
          created_by: string | null;
          from_date: string | null;
          id: string;
          kind: Database["public"]["Enums"]["place_kind"];
          person_id: string;
          place_id: string;
          space_id: string;
          to_date: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          from_date?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["place_kind"];
          person_id: string;
          place_id: string;
          space_id: string;
          to_date?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          from_date?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["place_kind"];
          person_id?: string;
          place_id?: string;
          space_id?: string;
          to_date?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "person_places_space_id_person_id_fkey";
            columns: ["space_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "persons";
            referencedColumns: ["space_id", "id"];
          },
          {
            foreignKeyName: "person_places_space_id_place_id_fkey";
            columns: ["space_id", "place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["space_id", "id"];
          },
        ];
      };
      persons: {
        Row: {
          biography: string | null;
          birth_date: string | null;
          birth_precision: Database["public"]["Enums"]["date_precision"];
          birth_qualifier: Database["public"]["Enums"]["date_qualifier"];
          created_at: string;
          created_by: string | null;
          death_date: string | null;
          death_precision: Database["public"]["Enums"]["date_precision"];
          death_qualifier: Database["public"]["Enums"]["date_qualifier"];
          deleted_at: string | null;
          email: string | null;
          family_name: string | null;
          gender: Database["public"]["Enums"]["gender"];
          given_name: string | null;
          id: string;
          identity_id: string;
          is_deceased: boolean;
          is_minor: boolean;
          is_placeholder: boolean;
          merged_into: string | null;
          minor_override: boolean | null;
          phone: string | null;
          phone_status: Database["public"]["Enums"]["phone_status"];
          photo_media_id: string | null;
          space_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          biography?: string | null;
          birth_date?: string | null;
          birth_precision?: Database["public"]["Enums"]["date_precision"];
          birth_qualifier?: Database["public"]["Enums"]["date_qualifier"];
          created_at?: string;
          created_by?: string | null;
          death_date?: string | null;
          death_precision?: Database["public"]["Enums"]["date_precision"];
          death_qualifier?: Database["public"]["Enums"]["date_qualifier"];
          deleted_at?: string | null;
          email?: string | null;
          family_name?: string | null;
          gender?: Database["public"]["Enums"]["gender"];
          given_name?: string | null;
          id?: string;
          identity_id: string;
          is_deceased?: boolean;
          is_minor?: boolean;
          is_placeholder?: boolean;
          merged_into?: string | null;
          minor_override?: boolean | null;
          phone?: string | null;
          phone_status?: Database["public"]["Enums"]["phone_status"];
          photo_media_id?: string | null;
          space_id: string;
          updated_at?: string;
        };
        Update: {
          biography?: string | null;
          birth_date?: string | null;
          birth_precision?: Database["public"]["Enums"]["date_precision"];
          birth_qualifier?: Database["public"]["Enums"]["date_qualifier"];
          created_at?: string;
          created_by?: string | null;
          death_date?: string | null;
          death_precision?: Database["public"]["Enums"]["date_precision"];
          death_qualifier?: Database["public"]["Enums"]["date_qualifier"];
          deleted_at?: string | null;
          email?: string | null;
          family_name?: string | null;
          gender?: Database["public"]["Enums"]["gender"];
          given_name?: string | null;
          id?: string;
          identity_id?: string;
          is_deceased?: boolean;
          is_minor?: boolean;
          is_placeholder?: boolean;
          merged_into?: string | null;
          minor_override?: boolean | null;
          phone?: string | null;
          phone_status?: Database["public"]["Enums"]["phone_status"];
          photo_media_id?: string | null;
          space_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "persons_identity_id_fkey";
            columns: ["identity_id"];
            isOneToOne: false;
            referencedRelation: "identities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "persons_photo_media_fk";
            columns: ["space_id", "photo_media_id"];
            isOneToOne: false;
            referencedRelation: "media";
            referencedColumns: ["space_id", "id"];
          },
          {
            foreignKeyName: "persons_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "persons_space_id_merged_into_fkey";
            columns: ["space_id", "merged_into"];
            isOneToOne: false;
            referencedRelation: "persons";
            referencedColumns: ["space_id", "id"];
          },
        ];
      };
      places: {
        Row: {
          city: string | null;
          country_code: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          label: string;
          lat: number | null;
          lng: number | null;
          needs_geocoding: boolean | null;
          region: string | null;
          space_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          city?: string | null;
          country_code?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label: string;
          lat?: number | null;
          lng?: number | null;
          needs_geocoding?: never;
          region?: string | null;
          space_id: string;
          updated_at?: string;
        };
        Update: {
          city?: string | null;
          country_code?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label?: string;
          lat?: number | null;
          lng?: number | null;
          needs_geocoding?: never;
          region?: string | null;
          space_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "places_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_views: {
        Row: {
          config: NonNullable<Json>;
          created_at: string;
          id: string;
          name: string;
          space_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          config?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          name: string;
          space_id: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          config?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          name?: string;
          space_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_views_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      space_members: {
        Row: {
          created_at: string;
          joined_at: string;
          person_id: string | null;
          role: Database["public"]["Enums"]["member_role"];
          space_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          joined_at?: string;
          person_id?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          space_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          joined_at?: string;
          person_id?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          space_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "space_members_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "space_members_space_id_person_id_fkey";
            columns: ["space_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "persons";
            referencedColumns: ["space_id", "id"];
          },
        ];
      };
      spaces: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      submission_resolutions: {
        Row: {
          action: Database["public"]["Enums"]["resolution_action"];
          created_at: string;
          created_by: string | null;
          id: string;
          person_id: string | null;
          space_id: string;
          submission_id: string;
          temp_person_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: Database["public"]["Enums"]["resolution_action"];
          created_at?: string;
          created_by?: string | null;
          id?: string;
          person_id?: string | null;
          space_id: string;
          submission_id: string;
          temp_person_id: string;
        };
        Update: {
          action?: Database["public"]["Enums"]["resolution_action"];
          created_at?: string;
          created_by?: string | null;
          id?: string;
          person_id?: string | null;
          space_id?: string;
          submission_id?: string;
          temp_person_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "submission_resolutions_space_id_person_id_fkey";
            columns: ["space_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "persons";
            referencedColumns: ["space_id", "id"];
          },
          {
            foreignKeyName: "submission_resolutions_space_id_submission_id_fkey";
            columns: ["space_id", "submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["space_id", "id"];
          },
        ];
      };
      submissions: {
        Row: {
          anchor_person_id: string | null;
          consent_given_at: string | null;
          created_at: string;
          form_link_id: string | null;
          id: string;
          ip_hash: string | null;
          mode: Database["public"]["Enums"]["submission_mode"];
          payload: NonNullable<Json>;
          resume_token: string;
          review_notes: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          space_id: string;
          status: Database["public"]["Enums"]["submission_status"];
          submitter_email: string | null;
          submitter_name: string;
          submitter_phone: string | null;
          submitter_user_id: string | null;
          updated_at: string;
          user_agent: string | null;
        };
        ComputedFields: never;
        Insert: {
          anchor_person_id?: string | null;
          consent_given_at?: string | null;
          created_at?: string;
          form_link_id?: string | null;
          id?: string;
          ip_hash?: string | null;
          mode: Database["public"]["Enums"]["submission_mode"];
          payload?: NonNullable<Json>;
          resume_token?: string;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          space_id: string;
          status?: Database["public"]["Enums"]["submission_status"];
          submitter_email?: string | null;
          submitter_name: string;
          submitter_phone?: string | null;
          submitter_user_id?: string | null;
          updated_at?: string;
          user_agent?: string | null;
        };
        Update: {
          anchor_person_id?: string | null;
          consent_given_at?: string | null;
          created_at?: string;
          form_link_id?: string | null;
          id?: string;
          ip_hash?: string | null;
          mode?: Database["public"]["Enums"]["submission_mode"];
          payload?: NonNullable<Json>;
          resume_token?: string;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          space_id?: string;
          status?: Database["public"]["Enums"]["submission_status"];
          submitter_email?: string | null;
          submitter_name?: string;
          submitter_phone?: string | null;
          submitter_user_id?: string | null;
          updated_at?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "submissions_space_id_anchor_person_id_fkey";
            columns: ["space_id", "anchor_person_id"];
            isOneToOne: false;
            referencedRelation: "persons";
            referencedColumns: ["space_id", "id"];
          },
          {
            foreignKeyName: "submissions_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_space_id_form_link_id_fkey";
            columns: ["space_id", "form_link_id"];
            isOneToOne: false;
            referencedRelation: "form_links";
            referencedColumns: ["space_id", "id"];
          },
        ];
      };
      suggestions: {
        Row: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          patch: NonNullable<Json>;
          person_id: string;
          proposed_by: string | null;
          space_id: string;
          status: Database["public"]["Enums"]["decision_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          patch: NonNullable<Json>;
          person_id: string;
          proposed_by?: string | null;
          space_id: string;
          status?: Database["public"]["Enums"]["decision_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          patch?: NonNullable<Json>;
          person_id?: string;
          proposed_by?: string | null;
          space_id?: string;
          status?: Database["public"]["Enums"]["decision_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suggestions_space_id_person_id_fkey";
            columns: ["space_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "persons";
            referencedColumns: ["space_id", "id"];
          },
        ];
      };
      union_members: {
        Row: {
          created_at: string;
          created_by: string | null;
          person_id: string;
          space_id: string;
          union_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          person_id: string;
          space_id: string;
          union_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          person_id?: string;
          space_id?: string;
          union_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "union_members_space_id_person_id_fkey";
            columns: ["space_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "persons";
            referencedColumns: ["space_id", "id"];
          },
          {
            foreignKeyName: "union_members_space_id_union_id_fkey";
            columns: ["space_id", "union_id"];
            isOneToOne: false;
            referencedRelation: "unions";
            referencedColumns: ["space_id", "id"];
          },
        ];
      };
      unions: {
        Row: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          end_date: string | null;
          end_precision: Database["public"]["Enums"]["date_precision"];
          end_qualifier: Database["public"]["Enums"]["date_qualifier"];
          end_reason: Database["public"]["Enums"]["union_end_reason"] | null;
          id: string;
          kind: Database["public"]["Enums"]["union_kind"];
          space_id: string;
          start_date: string | null;
          start_precision: Database["public"]["Enums"]["date_precision"];
          start_qualifier: Database["public"]["Enums"]["date_qualifier"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          end_date?: string | null;
          end_precision?: Database["public"]["Enums"]["date_precision"];
          end_qualifier?: Database["public"]["Enums"]["date_qualifier"];
          end_reason?: Database["public"]["Enums"]["union_end_reason"] | null;
          id?: string;
          kind?: Database["public"]["Enums"]["union_kind"];
          space_id: string;
          start_date?: string | null;
          start_precision?: Database["public"]["Enums"]["date_precision"];
          start_qualifier?: Database["public"]["Enums"]["date_qualifier"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          end_date?: string | null;
          end_precision?: Database["public"]["Enums"]["date_precision"];
          end_qualifier?: Database["public"]["Enums"]["date_qualifier"];
          end_reason?: Database["public"]["Enums"]["union_end_reason"] | null;
          id?: string;
          kind?: Database["public"]["Enums"]["union_kind"];
          space_id?: string;
          start_date?: string | null;
          start_precision?: Database["public"]["Enums"]["date_precision"];
          start_qualifier?: Database["public"]["Enums"]["date_qualifier"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "unions_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      data_issues: {
        Row: {
          details: Json | null;
          issue: string | null;
          person_ids: string[] | null;
          space_id: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
    };
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: string };
      add_child: {
        Args: {
          p_existing?: string;
          p_kind?: Database["public"]["Enums"]["parent_child_kind"];
          p_new?: Json;
          p_other_parent_id?: string;
          p_parent_id: string;
        };
        Returns: string;
      };
      add_parent: {
        Args: {
          p_child_id: string;
          p_existing?: string;
          p_kind?: Database["public"]["Enums"]["parent_child_kind"];
          p_link_partner?: boolean;
          p_new?: Json;
          p_union_kind?: Database["public"]["Enums"]["union_kind"];
        };
        Returns: string;
      };
      add_partner: {
        Args: {
          p_end_reason?: Database["public"]["Enums"]["union_end_reason"];
          p_existing?: string;
          p_kind?: Database["public"]["Enums"]["union_kind"];
          p_new?: Json;
          p_person_id: string;
          p_start?: Json;
        };
        Returns: string;
      };
      add_sibling: {
        Args: { p_existing?: string; p_new?: Json; p_parent_ids?: string[]; p_person_id: string };
        Returns: string;
      };
      ancestors: {
        Args: { p_max_depth?: number; p_person_id: string };
        Returns: {
          depth: number;
          person_id: string;
        }[];
      };
      assert_person_has_place: { Args: { p_person_id: string }; Returns: undefined };
      claim_self: { Args: { p_person_id: string }; Returns: undefined };
      commit_payload: {
        Args: {
          p_anchor_person_id?: string;
          p_mode?: Database["public"]["Enums"]["submission_mode"];
          p_payload: Json;
          p_space_id: string;
        };
        Returns: Json;
      };
      compute_is_minor: {
        Args: {
          p_birth_date: string;
          p_birth_precision: Database["public"]["Enums"]["date_precision"];
          p_is_deceased: boolean;
          p_minor_override: boolean;
          p_ref: string;
        };
        Returns: boolean;
      };
      create_person: { Args: { p: Json; p_space_id: string }; Returns: string };
      dedup_candidates: {
        Args: {
          p_birth_year?: number;
          p_exclude_person_id?: string;
          p_family?: string;
          p_given: string;
          p_limit?: number;
          p_location?: string;
          p_phone?: string;
          p_related_person_ids?: string[];
          p_space_id: string;
        };
        Returns: {
          person_id: string;
          reasons: string[];
          score: number;
        }[];
      };
      descendants: {
        Args: { p_max_depth?: number; p_person_id: string };
        Returns: {
          depth: number;
          person_id: string;
        }[];
      };
      ensure_union: {
        Args: { p_a: string; p_b: string; p_kind: Database["public"]["Enums"]["union_kind"]; p_space_id: string };
        Returns: string;
      };
      find_or_create_place: { Args: { p_label: string; p_space_id: string }; Returns: string };
      fuzzy_date_end: { Args: { d: string; p: Database["public"]["Enums"]["date_precision"] }; Returns: string };
      fuzzy_date_is_normalised: {
        Args: { d: string; p: Database["public"]["Enums"]["date_precision"] };
        Returns: boolean;
      };
      get_invite: { Args: { p_token: string }; Returns: Json };
      has_role: { Args: { p_min: Database["public"]["Enums"]["member_role"]; p_space_id: string }; Returns: boolean };
      is_member: { Args: { p_space_id: string }; Returns: boolean };
      lock_space_graph: { Args: { p_space_id: string }; Returns: undefined };
      neighborhood: { Args: { p_down?: number; p_focus_id: string; p_up?: number }; Returns: Json };
      person_space: { Args: { p_person_id: string }; Returns: string };
      refresh_minor_flags: { Args: Record<PropertyKey, never>; Returns: number };
      remove_person: { Args: { p_person_id: string }; Returns: undefined };
      resolve_person: { Args: { p_existing: string; p_new: Json; p_space_id: string }; Returns: string };
      siblings: {
        Args: { p_person_id: string };
        Returns: {
          kind: string;
          person_id: string;
          shared_parent_ids: string[];
        }[];
      };
      start_family: { Args: { p_name: string; p_self: Json }; Returns: string };
      update_person: { Args: { p: Json; p_person_id: string }; Returns: undefined };
    };
    Enums: {
      branch_lineage: "all_descendants" | "patrilineal" | "matrilineal";
      change_op: "insert" | "update" | "delete";
      date_precision: "day" | "month" | "year" | "decade" | "unknown";
      date_qualifier: "exact" | "about" | "before" | "after";
      decision_status: "pending" | "approved" | "rejected";
      form_link_status: "active" | "paused" | "expired";
      gender: "male" | "female" | "other" | "unknown";
      invite_status: "pending" | "accepted" | "expired" | "revoked";
      link_platform: "linkedin" | "instagram" | "facebook" | "x" | "website" | "other";
      member_role: "viewer" | "editor" | "admin" | "owner";
      name_kind: "birth" | "married" | "nickname" | "alias" | "transliteration";
      parent_child_kind: "biological" | "adoptive" | "step" | "foster" | "guardian" | "unknown";
      phone_status: "provided" | "requested" | "not_applicable";
      place_kind: "birth" | "death" | "residence" | "current" | "ancestral";
      resolution_action: "create" | "link_existing" | "reject";
      submission_mode: "self" | "interview" | "public";
      submission_status: "draft" | "pending" | "approved" | "partially_approved" | "rejected";
      union_end_reason: "divorce" | "separation" | "death";
      union_kind: "marriage" | "partnership" | "unknown";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      branch_lineage: ["all_descendants", "patrilineal", "matrilineal"],
      change_op: ["insert", "update", "delete"],
      date_precision: ["day", "month", "year", "decade", "unknown"],
      date_qualifier: ["exact", "about", "before", "after"],
      decision_status: ["pending", "approved", "rejected"],
      form_link_status: ["active", "paused", "expired"],
      gender: ["male", "female", "other", "unknown"],
      invite_status: ["pending", "accepted", "expired", "revoked"],
      link_platform: ["linkedin", "instagram", "facebook", "x", "website", "other"],
      member_role: ["viewer", "editor", "admin", "owner"],
      name_kind: ["birth", "married", "nickname", "alias", "transliteration"],
      parent_child_kind: ["biological", "adoptive", "step", "foster", "guardian", "unknown"],
      phone_status: ["provided", "requested", "not_applicable"],
      place_kind: ["birth", "death", "residence", "current", "ancestral"],
      resolution_action: ["create", "link_existing", "reject"],
      submission_mode: ["self", "interview", "public"],
      submission_status: ["draft", "pending", "approved", "partially_approved", "rejected"],
      union_end_reason: ["divorce", "separation", "death"],
      union_kind: ["marriage", "partnership", "unknown"],
    },
  },
} as const;
